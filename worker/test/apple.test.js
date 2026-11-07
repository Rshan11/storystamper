// Unit tests for Sign in with Apple token verification (run: npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyAppleIdentityToken, revokeAppleToken } from "../src/apple.js";
import { bytesToBase64Url, sha256Hex, bytesToBase64 } from "../src/crypto.js";

const enc = new TextEncoder();
const env = { APPLE_BUNDLE_ID: "com.storystamper.app" };

const { privateKey, publicKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "test-kid", alg: "RS256", use: "sig" };

const realFetch = globalThis.fetch;
let fetchLog = [];
globalThis.fetch = async (url, opts) => {
  fetchLog.push({ url: String(url), opts });
  if (String(url).endsWith("/auth/keys")) return new Response(JSON.stringify({ keys: [jwk] }));
  if (String(url).endsWith("/auth/revoke")) return new Response("", { status: 200 });
  return realFetch(url, opts);
};

async function makeToken(overrides = {}, rawNonce = "nonce-123") {
  const header = { alg: "RS256", kid: "test-kid" };
  const claims = {
    iss: "https://appleid.apple.com",
    aud: "com.storystamper.app",
    sub: "001234.abc",
    exp: Math.floor(Date.now() / 1000) + 600,
    email: "x@privaterelay.appleid.com",
    email_verified: "true",
    nonce: await sha256Hex(rawNonce),
    ...overrides,
  };
  const input = `${bytesToBase64Url(enc.encode(JSON.stringify(header)))}.${bytesToBase64Url(enc.encode(JSON.stringify(claims)))}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, enc.encode(input)));
  return `${input}.${bytesToBase64Url(sig)}`;
}

test("accepts a valid token", async () => {
  const claims = await verifyAppleIdentityToken(await makeToken(), "nonce-123", env);
  assert.equal(claims.sub, "001234.abc");
});

test("rejects wrong nonce", async () => {
  await assert.rejects(verifyAppleIdentityToken(await makeToken(), "other", env), /nonce/);
});

test("rejects missing nonce", async () => {
  await assert.rejects(verifyAppleIdentityToken(await makeToken(), undefined, env), /nonce/);
});

test("rejects wrong audience", async () => {
  await assert.rejects(
    verifyAppleIdentityToken(await makeToken({ aud: "com.evil.app" }), "nonce-123", env),
    /audience/,
  );
});

test("rejects expired token", async () => {
  await assert.rejects(
    verifyAppleIdentityToken(await makeToken({ exp: 1000 }), "nonce-123", env),
    /expired/,
  );
});

test("rejects tampered payload", async () => {
  const [h, , s] = (await makeToken()).split(".");
  const evil = bytesToBase64Url(enc.encode(JSON.stringify({ iss: "https://appleid.apple.com", aud: "com.storystamper.app", sub: "victim", exp: 9999999999 })));
  await assert.rejects(verifyAppleIdentityToken(`${h}.${evil}.${s}`, "nonce-123", env), /signature/);
});

test("revocation signs an ES256 client secret", async () => {
  const ec = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("pkcs8", ec.privateKey)));
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----`;
  fetchLog = [];
  const ok = await revokeAppleToken("refresh-tok", {
    ...env,
    APPLE_TEAM_ID: "TEAM123456",
    APPLE_KEY_ID: "KEY1234567",
    APPLE_PRIVATE_KEY: pem,
  });
  assert.equal(ok, true);
  const form = new URLSearchParams(String(fetchLog[0].opts.body));
  assert.equal(form.get("client_id"), "com.storystamper.app");
  const [h, p, s] = form.get("client_secret").split(".");
  const b64 = (x) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (x.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, ec.publicKey, b64(s), enc.encode(`${h}.${p}`));
  assert.equal(valid, true);
  assert.equal(JSON.parse(new TextDecoder().decode(b64(p))).iss, "TEAM123456");
});
