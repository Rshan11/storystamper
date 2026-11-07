// Static HTML files (embedded for single-worker deployment)
import { INDEX_HTML, LOGIN_HTML, MANIFEST_JSON } from "./static.js";

// Beta access PIN - change this to whatever you want
const BETA_PIN = "#STAMPERS2025";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    // Serve static assets (no auth needed)
    if (
      path.startsWith("/icons/") ||
      path === "/favicon.ico" ||
      path === "/favicon.svg" ||
      path === "/manifest.json"
    ) {
      return serveStaticAsset(path, env);
    }

    // Login page (no auth needed)
    if (path === "/login") {
      return serveHTML(LOGIN_HTML);
    }

    // Login API
    if (path === "/api/login" && request.method === "POST") {
      return handleLogin(request, env);
    }

    // Health check (no auth needed)
    if (request.method === "GET" && path === "/api/health") {
      return new Response(
        JSON.stringify({
          version: "3.0",
          hasApiKey: !!env.GEMINI_API_KEY,
          model: env.GEMINI_MODEL || DEFAULT_MODEL,
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
          },
        },
      );
    }

    // All other routes require PIN auth
    if (!checkAuth(request)) {
      return Response.redirect(new URL("/login", request.url).toString(), 302);
    }

    // Main app page
    if (request.method === "GET" && (path === "/" || path === "/index.html")) {
      return serveHTML(INDEX_HTML);
    }

    // API endpoint for fact-checking
    if (request.method === "POST" && (path === "/" || path === "/api/check")) {
      return handleFactCheck(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ============ Auth Functions ============

function checkAuth(request) {
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  return cookies["ss_auth"] === "valid";
}

function handleLogin(request, env) {
  return request
    .json()
    .then(({ pin }) => {
      if (pin && pin.toUpperCase() === BETA_PIN) {
        // Set cookie for 7 days
        const cookie =
          "ss_auth=valid; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800";
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": cookie,
          },
        });
      }
      return new Response(JSON.stringify({ error: "Invalid PIN" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    })
    .catch(() => {
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    });
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) cookies[name] = rest.join("=");
  });
  return cookies;
}

// ============ Static File Serving ============

function serveHTML(html) {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

async function serveStaticAsset(path, env) {
  if (path === "/manifest.json") {
    return new Response(MANIFEST_JSON, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
  return new Response("Not Found", { status: 404 });
}

// ============ Fact-Check Logic ============

async function handleFactCheck(request, env) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get("image");

    if (!imageFile) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const arrayBuffer = await imageFile.arrayBuffer();
    const fileSizeKB = Math.round(arrayBuffer.byteLength / 1024);

    console.log(`File size: ${fileSizeKB}KB`);

    if (arrayBuffer.byteLength > 4 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: `Image too large: ${fileSizeKB}KB. Max 4MB.` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        },
      );
    }

    // Convert image to base64 (chunked to avoid stack overflow)
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 4096;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(
        i,
        Math.min(i + chunkSize, uint8Array.length),
      );
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Image = btoa(binary);
    const mimeType = imageFile.type || "image/jpeg";
    console.log(`Base64 length: ${base64Image.length}, mimeType: ${mimeType}`);

    // Call Gemini for fact-checking
    const factCheckResult = await checkWithGemini(
      base64Image,
      mimeType,
      env.GEMINI_API_KEY,
      env.GEMINI_MODEL,
    );

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: null,
        verdict: factCheckResult.verdict,
        reasons: factCheckResult.reasons,
        claimSummary: factCheckResult.claim_summary || null,
        sources: factCheckResult.sources || [],
        model: factCheckResult.model,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  } catch (error) {
    console.error("Error:", error.stack || error);
    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack,
        type: error.name,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders(),
        },
      },
    );
  }
}

// Primary model + fallback. Override the primary with GEMINI_MODEL in wrangler.toml.
const DEFAULT_MODEL = "gemini-3.8-flash";
const FALLBACK_MODEL = "gemini-3.6-flash";
const VALID_VERDICTS = [
  "Verified True",
  "Likely True",
  "Unverified",
  "Likely False",
  "Verified False",
  "Satire",
];

async function checkWithGemini(base64Image, mimeType, apiKey, primaryModel) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the worker");
  }

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const prompt = `Today's date is ${today}.

You are a careful, neutral fact-checker analyzing a screenshot of a social media post.

Steps:
1. Read the screenshot and identify the main factual claim(s). Ignore opinions, jokes, and commentary.
2. Use Google Search to check the claim against current, reputable sources (major news outlets, official/government sites, established fact-checkers). Do NOT rely on memory for anything about current events, people's current roles, or recent news - search for it.
3. Decide on a verdict:
   - "Verified True": reputable sources clearly confirm it
   - "Likely True": mostly supported, minor details unconfirmed
   - "Unverified": you could not find reliable confirmation either way
   - "Likely False": strong evidence it is wrong or misleading
   - "Verified False": reputable sources clearly debunk it
   - "Satire": the post comes from a satire/parody source or is plainly a joke
4. Write up to 3 short reasons (under 90 characters each), concise and non-confrontational, citing what the sources say.

Return ONLY valid JSON, no markdown, in exactly this format:
{
  "verdict": "Verified True|Likely True|Unverified|Likely False|Verified False|Satire",
  "reasons": ["reason 1", "reason 2", "reason 3"],
  "claim_summary": "one sentence summary of the claim"
}`;

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64Image } },
        ],
      },
    ],
    // Live Google Search grounding so verdicts reflect current events
    tools: [{ googleSearch: {} }],
    generationConfig: {
      thinkingConfig: { thinkingLevel: "MEDIUM" },
    },
  });

  const models = [primaryModel || DEFAULT_MODEL];
  if (!models.includes(FALLBACK_MODEL)) models.push(FALLBACK_MODEL);

  let data;
  let usedModel;
  let lastError;
  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
      },
    );
    if (response.ok) {
      data = await response.json();
      usedModel = model;
      break;
    }
    const errorText = await response.text();
    console.error(`Gemini API error (${model}):`, response.status, errorText);
    lastError = new Error(`Gemini API error: ${response.status} - ${errorText}`);
    // Only fall back on model-availability / overload errors, not bad requests or auth
    if (![404, 429, 500, 503].includes(response.status)) break;
  }
  if (!data) throw lastError;

  const candidate = data.candidates?.[0];
  const textContent = (candidate?.content?.parts || [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join("");

  if (!textContent) {
    console.error("Empty Gemini response:", JSON.stringify(data));
    throw new Error("No response from Gemini");
  }

  // Collect the web sources Google Search used
  const seen = new Set();
  const sources = [];
  for (const chunk of candidate?.groundingMetadata?.groundingChunks || []) {
    const uri = chunk.web?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title: chunk.web.title || uri, url: uri });
    }
  }

  const result = parseVerdictJson(textContent);
  if (!VALID_VERDICTS.includes(result.verdict)) result.verdict = "Unverified";
  if (!Array.isArray(result.reasons)) result.reasons = [];
  result.sources = sources.slice(0, 5);
  result.model = usedModel;
  return result;
}

function parseVerdictJson(text) {
  let jsonStr = text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    jsonStr = fenced[1];
  } else {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) jsonStr = text.slice(first, last + 1);
  }
  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error("Failed to parse Gemini response:", text);
    return {
      verdict: "Unverified",
      reasons: ["Unable to analyze this content"],
      claim_summary: "Analysis failed",
    };
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
