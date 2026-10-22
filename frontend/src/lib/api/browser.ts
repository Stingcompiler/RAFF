"use client";

/** Browser-side API calls: same origin, session cookie, CSRF header on every change. */

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: Record<string, unknown> | null };

function readCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function csrfToken(): Promise<string> {
  let token = readCookie("csrftoken");
  if (!token) {
    await fetch("/api/v1/auth/csrf/", { credentials: "same-origin" });
    token = readCookie("csrftoken");
  }
  return token ?? "";
}

export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  return send<T>("GET", path);
}

export async function apiSend<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options: { idempotencyKey?: string } = {},
): Promise<ApiResult<T>> {
  return send<T>(method, path, body, options.idempotencyKey);
}

async function send<T>(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (method !== "GET") {
    headers["x-csrftoken"] = await csrfToken();
    if (body !== undefined) headers["content-type"] = "application/json";
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: null };
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return res.ok
    ? { ok: true, status: res.status, data: data as T }
    : { ok: false, status: res.status, error: data as Record<string, unknown> | null };
}
