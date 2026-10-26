import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import type { ShellContext } from "@/components/shell/types";
import { serverGet } from "@/lib/api/server";
import type { Me } from "@/lib/api/types";

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

/** Shell data for the signed-in user and the branch/counter of this session. */
export async function getShellContext(
  me: Me & { branch: NonNullable<Me["branch"]> },
): Promise<ShellContext> {
  const t = await getTranslations();
  const ar = (await getLocale()) === "ar";
  const pick = (o: { name_ar: string; name_en: string }) => (ar ? o.name_ar : o.name_en);
  const online = await serverReachable();
  // New storefront orders badge the Orders item (STOREFRONT-DESIGN-CHANGES §5.1).
  const summary = me.permissions.includes("orders.manage")
    ? await serverGet<{ unread: number }>("/orders/summary/").catch(() => null)
    : null;
  const name = ar ? me.user.display_name_ar : me.user.display_name_en;
  return {
    branchLine: pick(me.branch),
    connection: online
      ? { status: "online", text: t("connection.chipOnline") }
      : { status: "unavailable", text: t("connection.chipUnavailable") },
    user: {
      name,
      role: me.role ? pick(me.role) : null,
      username: me.user.username,
      initial: name.slice(0, 1),
    },
    deviceLine: me.device ? t("shell.deviceLine", { device: pick(me.device) }) : "",
    badges: summary?.unread ? { orders: summary.unread } : undefined,
  };
}
