// StoryStamper worker: web app, iOS API, accounts, and AI fact-checking

import { INDEX_HTML, LOGIN_HTML, MANIFEST_JSON, PRIVACY_HTML, SUPPORT_HTML } from "./static.js";
import { checkWithGemini, DEFAULT_MODEL } from "./gemini.js";
import { bytesToBase64 } from "./crypto.js";
import { json, errorJson, html } from "./http.js";
import {
  getCurrentUser,
  getUsage,
  reserveCheck,
  releaseCheck,
  handleSignup,
  handleLogin,
  handleAppleSignIn,
  handleLogout,
  handleMe,
  handleDeleteAccount,
  isAdmin,
  handleCreateInvites,
  handleListInvites,
} from "./auth.js";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      console.error("Unhandled error:", error.stack || error);
      return errorJson("Something went wrong on our end. Please try again.", 500);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "OPTIONS") return new Response(null, { status: 204 });

  // Block cross-site state-changing requests that rely on the cookie
  if (method !== "GET" && method !== "HEAD" && !sameOriginOrToken(request, url)) {
    return errorJson("Cross-site request blocked", 403);
  }

  // ---- Public pages ----
  if (method === "GET") {
    if (path === "/manifest.json") {
      return new Response(MANIFEST_JSON, {
        headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
      });
    }
    if (path === "/privacy") return html(PRIVACY_HTML);
    if (path === "/support") return html(supportPage(env));
    if (path === "/api/health") {
      return json({
        version: "4.0",
        hasApiKey: !!env.GEMINI_API_KEY,
        hasDatabase: !!env.DB,
        model: env.GEMINI_MODEL || DEFAULT_MODEL,
        timestamp: new Date().toISOString(),
      });
    }
    if (path === "/login") {
      if (await getCurrentUser(request, env)) return Response.redirect(new URL("/", url).toString(), 302);
      return html(LOGIN_HTML);
    }
  }

  // ---- Auth API ----
  if (method === "POST") {
    if (path === "/api/auth/signup") return handleSignup(request, env);
    if (path === "/api/auth/login") return handleLogin(request, env);
    if (path === "/api/auth/apple") return handleAppleSignIn(request, env);
    if (path === "/api/auth/logout") return handleLogout(request, env);
  }

  // ---- Admin API (Authorization: Bearer ADMIN_TOKEN) ----
  if (path === "/api/admin/invites") {
    if (!isAdmin(request, env)) return errorJson("Unauthorized", 401);
    if (method === "POST") return handleCreateInvites(request, env);
    if (method === "GET") return handleListInvites(env);
  }

  // ---- Everything below requires a signed-in user ----
  const user = await getCurrentUser(request, env);

  if (method === "GET" && (path === "/" || path === "/index.html")) {
    if (!user) return Response.redirect(new URL("/login", url).toString(), 302);
    return html(INDEX_HTML);
  }

  if (path.startsWith("/api/")) {
    if (!user) return errorJson("Please sign in.", 401, "unauthorized");
    if (method === "GET" && path === "/api/me") return handleMe(user, env);
    if (method === "DELETE" && path === "/api/account") return handleDeleteAccount(user, env);
    if (method === "POST" && path === "/api/check") return handleFactCheck(request, env, user);
  }

  return new Response("Not Found", { status: 404 });
}

function supportPage(env) {
  const email = (env.SUPPORT_EMAIL || "").replace(/[^a-zA-Z0-9@._+-]/g, "");
  const contact = email
    ? `<p>Email <a href="mailto:${email}">${email}</a> and we'll get back to you.</p>`
    : "<p>Contact the person who invited you to the beta.</p>";
  return SUPPORT_HTML.replace("<!--CONTACT-->", contact);
}

function sameOriginOrToken(request, url) {
  if ((request.headers.get("Authorization") || "").startsWith("Bearer ")) return true;
  const origin = request.headers.get("Origin");
  return !origin || origin === url.origin;
}

// ============ Fact-Check ============

async function handleFactCheck(request, env, user) {
  let imageFile;
  try {
    imageFile = (await request.formData()).get("image");
  } catch {
    return errorJson("Send the screenshot as multipart form data in the 'image' field.", 400);
  }
  if (!imageFile || typeof imageFile === "string") {
    return errorJson("No image provided", 400);
  }

  const mimeType = (imageFile.type || "image/jpeg").toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    return errorJson("Unsupported image type. Use JPEG, PNG, WebP or HEIC.", 400);
  }

  const arrayBuffer = await imageFile.arrayBuffer();
  if (arrayBuffer.byteLength === 0) return errorJson("The image is empty.", 400);
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    const kb = Math.round(arrayBuffer.byteLength / 1024);
    return errorJson(`Image too large: ${kb}KB. Max 4MB.`, 400);
  }

  if (!(await reserveCheck(env, user.id))) {
    const usage = await getUsage(env, user.id);
    return json(
      {
        error: `You've used all ${usage.limit} checks for today. Your limit resets at midnight UTC.`,
        code: "daily_limit",
        usage,
      },
      429,
    );
  }

  let result;
  try {
    result = await checkWithGemini(
      bytesToBase64(new Uint8Array(arrayBuffer)),
      mimeType,
      env.GEMINI_API_KEY,
      env.GEMINI_MODEL,
    );
  } catch (error) {
    await releaseCheck(env, user.id);
    console.error("Fact-check failed:", error.stack || error);
    return errorJson("The fact-checker is unavailable right now. Please try again in a minute.", 502);
  }

  return json({
    success: true,
    verdict: result.verdict,
    reasons: result.reasons,
    claimSummary: result.claim_summary || null,
    sources: result.sources || [],
    model: result.model,
    usage: await getUsage(env, user.id),
  });
}
