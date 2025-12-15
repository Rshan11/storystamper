// Static HTML files (embedded for single-worker deployment)
import { INDEX_HTML, LOGIN_HTML, MANIFEST_JSON } from "./static.js";

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

    // Public routes (no auth required)
    if (path === "/login" || path === "/login.html") {
      return serveHTML(LOGIN_HTML);
    }

    if (path === "/api/login") {
      return handleLogin(request, env);
    }

    // Serve static assets without auth (icons, manifest, etc.)
    if (
      path.startsWith("/icons/") ||
      path === "/favicon.ico" ||
      path === "/favicon.svg" ||
      path === "/manifest.json"
    ) {
      return serveStaticAsset(path, env);
    }

    // All other routes require authentication
    const authResult = await checkAuth(request, env);
    if (!authResult.valid) {
      return Response.redirect(new URL("/login", request.url).toString(), 302);
    }

    // Authenticated routes
    if (path === "/" || path === "/index.html") {
      return serveHTML(INDEX_HTML);
    }

    // API endpoint for fact-checking (existing logic)
    if (request.method === "POST" && (path === "/" || path === "/api/check")) {
      return handleFactCheck(request, env);
    }

    // GET on root for API health check
    if (request.method === "GET" && path === "/api/health") {
      return new Response(
        JSON.stringify({
          version: "2.1",
          hasApiKey: !!env.GEMINI_API_KEY,
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

    return new Response("Not Found", { status: 404 });
  },
};

// ============ Auth Functions ============

async function checkAuth(request, env) {
  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const sessionToken = cookies["ss_session"];

  if (!sessionToken) {
    return { valid: false };
  }

  // Verify the session token
  const isValid = await verifySessionToken(sessionToken, env);
  return { valid: isValid };
}

async function handleLogin(request, env) {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { code } = await request.json();

    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ error: "Invalid code format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const normalizedCode = code.trim().toUpperCase();

    // Check if code exists in KV
    const codeStatus = await env.INVITE_CODES.get(normalizedCode);

    if (!codeStatus || codeStatus !== "active") {
      return new Response(JSON.stringify({ error: "Invalid invite code" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate session token
    const sessionToken = await generateSessionToken(normalizedCode, env);

    // Set cookie (7 days expiry)
    const maxAge = 7 * 24 * 60 * 60; // 7 days in seconds
    const cookie = `ss_session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookie,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function generateSessionToken(code, env) {
  const secret = env.COOKIE_SECRET || "default-secret-change-me";
  const data = `${code}:${secret}`;

  // Create HMAC-SHA256 hash
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(code));
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Token format: code:hash (so we can verify the code is still active)
  return `${code}:${hashHex}`;
}

async function verifySessionToken(token, env) {
  try {
    const [code, providedHash] = token.split(":");

    if (!code || !providedHash) {
      return false;
    }

    // Verify the code is still active in KV
    const codeStatus = await env.INVITE_CODES.get(code);
    if (!codeStatus || codeStatus !== "active") {
      return false;
    }

    // Verify the hash
    const secret = env.COOKIE_SECRET || "default-secret-change-me";
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(code),
    );
    const hashArray = Array.from(new Uint8Array(signature));
    const expectedHash = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return providedHash === expectedHash;
  } catch {
    return false;
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split("=");
    if (name) {
      cookies[name] = rest.join("=");
    }
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
  // For manifest.json, return embedded version
  if (path === "/manifest.json") {
    return new Response(MANIFEST_JSON, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // For other static assets, we'd need to serve from R2 or embed them
  // For now, return 404 for assets not embedded
  // In production, you'd serve these from R2 or embed the binary data
  return new Response("Not Found", { status: 404 });
}

// ============ Fact-Check Logic ============

async function handleFactCheck(request, env) {
  try {
    let step = "parsing formData";
    const formData = await request.formData();

    step = "getting image";
    const imageFile = formData.get("image");

    if (!imageFile) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    step = "getting arrayBuffer";
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
    );

    return new Response(
      JSON.stringify({
        success: true,
        imageUrl: null,
        verdict: factCheckResult.verdict,
        reasons: factCheckResult.reasons,
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

async function checkWithGemini(base64Image, mimeType, apiKey) {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const prompt = `CONTEXT: Today is ${today}. Donald Trump is the current US President (second term, inaugurated January 2025).

You are a fact-checker analyzing a screenshot of a social media post.

Look at this image and:
1. Identify the main factual claim(s) being made
2. Evaluate whether the claim is likely true, likely false, clearly false, clearly true, or cannot be verified from trusted sources
3. Return your assessment

IMPORTANT:
- Only mark something as "Likely False" if you see strong evidence it is wrong
- Use "Unverified" if you simply cannot tell from normal knowledge
- Be concise and non-confrontational in your reasons

Return ONLY valid JSON in this exact format:
{
  "verdict": "Verified True|Likely True|Unverified|Likely False|Verified False|Satire",
  "reasons": ["reason 1", "reason 2", "reason 3"],
  "claim_summary": "one sentence summary of the claim"
}`;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Gemini API raw error:", response.status, errorText);
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  const textContent = data.candidates?.[0]?.content?.parts?.find(
    (p) => p.text,
  )?.text;

  if (!textContent) {
    throw new Error("No response from Gemini");
  }

  let jsonStr = textContent;
  const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error("Failed to parse Gemini response:", textContent);
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
