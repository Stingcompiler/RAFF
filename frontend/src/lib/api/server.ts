import "server-only";

import { cookies } from "next/headers";

const apiOrigin = process.env.RAFF_API_ORIGIN ?? "http://localhost:8000";

/**
 * GET from the API on behalf of the signed-in user (forwards their cookies).
 * Returns null when the session is missing or not allowed, or the thing does not exist.
 * A server that cannot be reached throws, so the screen shows an error with a retry instead
 * of an empty list that looks like "no documents" (review C-05).
 */
export async function serverGet<T>(path: string): Promise<T | null> {
  const cookie = (await cookies()).toString();
  const res = await fetch(`${apiOrigin}/api/v1${path}`, {
    headers: { cookie, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!res) throw new Error(`API ${path} could not be reached`);
  if (res.status === 401 || res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}
