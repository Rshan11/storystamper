// Small HTTP helpers shared across the worker

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export function errorJson(message, status, code) {
  return json(code ? { error: message, code } : { error: message }, status);
}

export function html(body) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

export async function readJson(request) {
  try {
    const data = await request.json();
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) cookies[name] = rest.join("=");
  }
  return cookies;
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || "unknown";
}
