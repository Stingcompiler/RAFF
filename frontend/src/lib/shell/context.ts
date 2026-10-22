import "server-only";

import { getTranslations } from "next-intl/server";

import type { ShellContext } from "@/components/shell/types";

const apiOrigin = process.env.RAFF_API_ORIGIN ?? "http://localhost:8000";

async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${apiOrigin}/api/v1/health/`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Shell data for the signed-in user. Branch, user and device arrive with
 * authentication (WO-02); until then only the server state is real.
 */
export async function getShellContext(): Promise<ShellContext> {
  const t = await getTranslations("connection");
  const online = await serverReachable();
  return {
    branchLine: "",
    connection: online
      ? { status: "online", text: t("chipOnline") }
      : { status: "unavailable", text: t("chipUnavailable") },
    user: { name: "", initial: "" },
    deviceLine: "",
  };
}
