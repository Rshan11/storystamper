// Accounts, sessions, invite codes and daily usage limits (Cloudflare D1)

import { hashPassword, verifyPassword, randomToken, sha256Hex, timingSafeEqual } from "./crypto.js";
import {
  verifyAppleIdentityToken,
  exchangeAppleAuthCode,
  revokeAppleToken,
} from "./apple.js";
import { json, errorJson, readJson, parseCookies, clientIp } from "./http.js";

export const SESSION_COOKIE = "ss_session";
const SESSION_DAYS = 30;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;
const FAILURE_WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES_PER_EMAIL = 8;
const MAX_FAILURES_PER_IP = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const nowSeconds = () => Math.floor(Date.now() / 1000);
const todayUtc = () => new Date().toISOString().slice(0, 10);

function inviteRequired(env) {
  return String(env.INVITE_REQUIRED ?? "true").toLowerCase() !== "false";
}

export function dailyLimit(env) {
  const n = parseInt(env.DAILY_CHECK_LIMIT ?? "25", 10);
  return Number.isFinite(n) && n > 0 ? n : 25;
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

// ---------- Sessions ----------

async function createSession(env, userId, client) {
  const token = randomToken(32);
  const now = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").bind(userId, now),
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, client, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(await sha256Hex(token), userId, client, now, now + SESSION_DAYS * 86400),
  ]);
  return token;
}

function sessionCookie(token, maxAge = SESSION_DAYS * 86400) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function getToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return parseCookies(request.headers.get("Cookie"))[SESSION_COOKIE] || null;
}

/** Returns the signed-in user for this request, or null. */
export async function getCurrentUser(request, env) {
  const token = getToken(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.apple_sub, u.password_hash, u.apple_refresh_token
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(tokenHash, nowSeconds())
    .first();
  return row ? { ...row, tokenHash } : null;
}

/** Response for a successful sign-in: token in body (iOS) + cookie (web). */
async function signedIn(env, user, request, status = 200) {
  const client = request.headers.get("X-Client") === "ios" ? "ios" : "web";
  const token = await createSession(env, user.id, client);
  const body = { success: true, token, user: await publicUser(env, user) };
  return json(body, status, client === "web" ? { "Set-Cookie": sessionCookie(token) } : {});
}

async function publicUser(env, user) {
  return {
    id: user.id,
    email: user.email || null,
    name: user.display_name || null,
    hasApple: !!user.apple_sub,
    usage: await getUsage(env, user.id),
  };
}

// ---------- Brute-force protection ----------

async function tooManyFailures(env, email, ip) {
  const since = nowSeconds() - FAILURE_WINDOW_SECONDS;
  const { results } = await env.DB.prepare(
    "SELECT key, COUNT(*) AS n FROM login_failures WHERE key IN (?, ?) AND at > ? GROUP BY key",
  )
    .bind(`email:${email}`, `ip:${ip}`, since)
    .all();
  for (const r of results || []) {
    if (r.key.startsWith("email:") && r.n >= MAX_FAILURES_PER_EMAIL) return true;
    if (r.key.startsWith("ip:") && r.n >= MAX_FAILURES_PER_IP) return true;
  }
  return false;
}

async function recordFailure(env, email, ip) {
  const now = nowSeconds();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO login_failures (key, at) VALUES (?, ?)").bind(`email:${email}`, now),
    env.DB.prepare("INSERT INTO login_failures (key, at) VALUES (?, ?)").bind(`ip:${ip}`, now),
    env.DB.prepare("DELETE FROM login_failures WHERE at < ?").bind(now - 86400),
  ]);
}

// ---------- Invite codes ----------

/** Atomically uses up one invite. Returns normalized code, or null if invalid/used up. */
async function consumeInvite(env, code) {
  const c = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!c) return null;
  const res = await env.DB.prepare(
    "UPDATE invite_codes SET uses = uses + 1 WHERE code = ? AND uses < max_uses",
  )
    .bind(c)
    .run();
  return res.meta.changes === 1 ? c : null;
}

async function releaseInvite(env, code) {
  if (!code) return;
  await env.DB.prepare("UPDATE invite_codes SET uses = uses - 1 WHERE code = ? AND uses > 0")
    .bind(code)
    .run();
}

function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `STAMP-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// ---------- Usage limits ----------

export async function getUsage(env, userId) {
  const row = await env.DB.prepare("SELECT count FROM usage WHERE user_id = ? AND day = ?")
    .bind(userId, todayUtc())
    .first();
  const limit = dailyLimit(env);
  const used = row?.count || 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/** Reserves one check for today. Returns false if the daily limit is reached. */
export async function reserveCheck(env, userId) {
  const row = await env.DB.prepare(
    `INSERT INTO usage (user_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1 WHERE count < ?
     RETURNING count`,
  )
    .bind(userId, todayUtc(), dailyLimit(env))
    .first();
  return !!row;
}

/** Gives back a reserved check (e.g. when the AI call failed). */
export async function releaseCheck(env, userId) {
  await env.DB.prepare(
    "UPDATE usage SET count = count - 1 WHERE user_id = ? AND day = ? AND count > 0",
  )
    .bind(userId, todayUtc())
    .run();
}

// ---------- Route handlers ----------

export async function handleSignup(request, env) {
  const { email: rawEmail, password, inviteCode, name } = await readJson(request);
  const email = normalizeEmail(rawEmail);

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return errorJson("Please enter a valid email address.", 400);
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return errorJson(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 400);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return errorJson("Password is too long.", 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) {
    return errorJson("An account with this email already exists. Try signing in.", 409);
  }

  let usedInvite = null;
  if (inviteRequired(env)) {
    usedInvite = await consumeInvite(env, inviteCode);
    if (!usedInvite) {
      return errorJson("That invite code is invalid or has been used up.", 403, "invite_invalid");
    }
  }

  const user = {
    id: crypto.randomUUID(),
    email,
    display_name: typeof name === "string" ? name.trim().slice(0, 100) || null : null,
  };
  try {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, display_name, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(user.id, email, await hashPassword(password), user.display_name, usedInvite, nowSeconds())
      .run();
  } catch (e) {
    await releaseInvite(env, usedInvite);
    if (String(e.message).includes("UNIQUE")) {
      return errorJson("An account with this email already exists. Try signing in.", 409);
    }
    throw e;
  }

  return signedIn(env, user, request, 201);
}

export async function handleLogin(request, env) {
  const { email: rawEmail, password } = await readJson(request);
  const email = normalizeEmail(rawEmail);
  const ip = clientIp(request);

  if (!email || typeof password !== "string" || !password) {
    return errorJson("Enter your email and password.", 400);
  }
  if (await tooManyFailures(env, email, ip)) {
    return errorJson("Too many failed attempts. Please wait 15 minutes and try again.", 429);
  }

  const user = await env.DB.prepare(
    "SELECT id, email, display_name, apple_sub, password_hash FROM users WHERE email = ?",
  )
    .bind(email)
    .first();

  // Always run a hash to keep timing similar whether or not the account exists
  const ok = user?.password_hash
    ? await verifyPassword(password, user.password_hash)
    : (await hashPassword(password), false);

  if (!ok) {
    await recordFailure(env, email, ip);
    if (user && !user.password_hash && user.apple_sub) {
      return errorJson("This account uses Sign in with Apple.", 401);
    }
    return errorJson("Incorrect email or password.", 401);
  }

  return signedIn(env, user, request);
}

export async function handleAppleSignIn(request, env) {
  const { identityToken, nonce, authorizationCode, inviteCode, name } = await readJson(request);

  let claims;
  try {
    claims = await verifyAppleIdentityToken(identityToken, nonce, env);
  } catch (e) {
    console.error("Apple sign-in rejected:", e.message);
    return errorJson("Sign in with Apple failed. Please try again.", 401);
  }

  const appleEmail = normalizeEmail(claims.email);
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";

  let user = await env.DB.prepare(
    "SELECT id, email, display_name, apple_sub FROM users WHERE apple_sub = ?",
  )
    .bind(claims.sub)
    .first();

  // Link to an existing email account if Apple verified the same address
  if (!user && appleEmail && emailVerified) {
    const byEmail = await env.DB.prepare(
      "SELECT id, email, display_name, apple_sub FROM users WHERE email = ?",
    )
      .bind(appleEmail)
      .first();
    if (byEmail && !byEmail.apple_sub) {
      await env.DB.prepare("UPDATE users SET apple_sub = ? WHERE id = ?")
        .bind(claims.sub, byEmail.id)
        .run();
      user = { ...byEmail, apple_sub: claims.sub };
    }
  }

  if (!user) {
    let usedInvite = null;
    if (inviteRequired(env)) {
      if (!inviteCode) {
        return errorJson("Enter your invite code to create an account.", 403, "invite_required");
      }
      usedInvite = await consumeInvite(env, inviteCode);
      if (!usedInvite) {
        return errorJson("That invite code is invalid or has been used up.", 403, "invite_invalid");
      }
    }
    user = {
      id: crypto.randomUUID(),
      email: appleEmail || null,
      display_name: typeof name === "string" ? name.trim().slice(0, 100) || null : null,
      apple_sub: claims.sub,
    };
    try {
      await env.DB.prepare(
        "INSERT INTO users (id, email, apple_sub, display_name, invite_code, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(user.id, user.email, user.apple_sub, user.display_name, usedInvite, nowSeconds())
        .run();
    } catch (e) {
      await releaseInvite(env, usedInvite);
      throw e;
    }
  }

  // Keep a refresh token so we can revoke it if the user deletes their account
  const refreshToken = await exchangeAppleAuthCode(authorizationCode, claims.aud, env);
  if (refreshToken) {
    await env.DB.prepare("UPDATE users SET apple_refresh_token = ? WHERE id = ?")
      .bind(refreshToken, user.id)
      .run();
  }

  return signedIn(env, user, request);
}

export async function handleLogout(request, env) {
  const user = await getCurrentUser(request, env);
  if (user) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(user.tokenHash).run();
  }
  return json({ success: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

export async function handleMe(user, env) {
  return json({ user: await publicUser(env, user) });
}

export async function handleDeleteAccount(user, env) {
  await revokeAppleToken(user.apple_refresh_token, env);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM usage WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return json({ success: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
}

// ---------- Admin (invite management) ----------

export function isAdmin(request, env) {
  const auth = request.headers.get("Authorization") || "";
  return !!env.ADMIN_TOKEN && auth.startsWith("Bearer ") && timingSafeEqual(auth.slice(7), env.ADMIN_TOKEN);
}

export async function handleCreateInvites(request, env) {
  const { count = 1, maxUses = 1, note = null } = await readJson(request);
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 100);
  const uses = Math.min(Math.max(parseInt(maxUses, 10) || 1, 1), 10000);
  const now = nowSeconds();
  const codes = Array.from({ length: n }, generateInviteCode);
  await env.DB.batch(
    codes.map((c) =>
      env.DB.prepare(
        "INSERT INTO invite_codes (code, max_uses, uses, note, created_at) VALUES (?, ?, 0, ?, ?)",
      ).bind(c, uses, typeof note === "string" ? note.slice(0, 200) : null, now),
    ),
  );
  return json({ codes, maxUses: uses }, 201);
}

export async function handleListInvites(env) {
  const { results } = await env.DB.prepare(
    "SELECT code, max_uses, uses, note, created_at FROM invite_codes ORDER BY created_at DESC LIMIT 500",
  ).all();
  return json({ invites: results || [] });
}
