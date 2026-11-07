// Sign in with Apple: identity token verification + optional token revocation
//
// Required var:   APPLE_BUNDLE_ID (comma-separated list allowed)
// Optional secrets (enable revoking Apple tokens on account deletion, which
// App Store review expects for apps offering Sign in with Apple):
//   APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (contents of the .p8 file)

import { base64UrlToBytes, bytesToBase64Url, base64ToBytes, sha256Hex } from "./crypto.js";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const decoder = new TextDecoder();
const encoder = new TextEncoder();

let jwksCache = { keys: null, fetchedAt: 0 };

async function getAppleKeys(forceRefresh = false) {
  const maxAge = 60 * 60 * 1000;
  if (!forceRefresh && jwksCache.keys && Date.now() - jwksCache.fetchedAt < maxAge) {
    return jwksCache.keys;
  }
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) throw new Error(`Could not fetch Apple keys: ${res.status}`);
  const { keys } = await res.json();
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

function decodeJwtPart(part) {
  return JSON.parse(decoder.decode(base64UrlToBytes(part)));
}

function allowedAudiences(env) {
  return (env.APPLE_BUNDLE_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Verifies an Apple identity token (JWT). Returns its claims or throws.
 * rawNonce: the un-hashed nonce the app generated; Apple embeds sha256(rawNonce).
 */
export async function verifyAppleIdentityToken(token, rawNonce, env) {
  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new Error("Malformed identity token");
  }
  const [headerB64, payloadB64, sigB64] = token.split(".");
  const header = decodeJwtPart(headerB64);
  const claims = decodeJwtPart(payloadB64);

  if (header.alg !== "RS256") throw new Error("Unexpected token algorithm");

  let keys = await getAppleKeys();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await getAppleKeys(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error("Unknown Apple signing key");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(sigB64),
    encoder.encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new Error("Invalid token signature");

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== APPLE_ISSUER) throw new Error("Invalid token issuer");
  if (!allowedAudiences(env).includes(claims.aud)) throw new Error("Invalid token audience");
  if (typeof claims.exp !== "number" || claims.exp < now) throw new Error("Token expired");
  if (!claims.sub) throw new Error("Token missing subject");

  // Nonce binds the token to this sign-in attempt (prevents replaying stolen tokens)
  if (typeof rawNonce !== "string" || !rawNonce || claims.nonce !== (await sha256Hex(rawNonce))) {
    throw new Error("Invalid nonce");
  }

  return claims;
}

// ---------- Optional: exchange auth code / revoke tokens ----------

export function appleRevocationConfigured(env) {
  return !!(env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);
}

async function createClientSecret(env, clientId) {
  const pem = env.APPLE_PRIVATE_KEY.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(pem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: env.APPLE_KEY_ID };
  const payload = {
    iss: env.APPLE_TEAM_ID,
    iat: now,
    exp: now + 300,
    aud: APPLE_ISSUER,
    sub: clientId,
  };
  const signingInput = `${bytesToBase64Url(encoder.encode(JSON.stringify(header)))}.${bytesToBase64Url(
    encoder.encode(JSON.stringify(payload)),
  )}`;
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(signingInput)),
  );
  return `${signingInput}.${bytesToBase64Url(sig)}`;
}

/** Exchanges a one-time authorization code for a refresh token (or null). */
export async function exchangeAppleAuthCode(code, clientId, env) {
  if (!code || !appleRevocationConfigured(env)) return null;
  try {
    const res = await fetch(`${APPLE_ISSUER}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: await createClientSecret(env, clientId),
        code,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      console.error("Apple token exchange failed:", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    return data.refresh_token || null;
  } catch (e) {
    console.error("Apple token exchange error:", e);
    return null;
  }
}

/** Revokes a user's Apple refresh token. Best-effort; never throws. */
export async function revokeAppleToken(refreshToken, env) {
  if (!refreshToken || !appleRevocationConfigured(env)) return false;
  const clientId = allowedAudiences(env)[0];
  try {
    const res = await fetch(`${APPLE_ISSUER}/auth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: await createClientSecret(env, clientId),
        token: refreshToken,
        token_type_hint: "refresh_token",
      }),
    });
    if (!res.ok) console.error("Apple revoke failed:", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("Apple revoke error:", e);
    return false;
  }
}
