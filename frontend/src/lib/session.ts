import "server-only";

import { redirect } from "next/navigation";

import { serverGet } from "@/lib/api/server";
import type { Me } from "@/lib/api/types";

/** The signed-in user, or a redirect to sign-in (and to branch choice when none is set). */
export async function requireMe(): Promise<Me & { branch: NonNullable<Me["branch"]> }> {
  const me = await serverGet<Me>("/auth/me/");
  if (!me) redirect("/login");
  if (!me.branch) redirect("/login?step=context");
  return me as Me & { branch: NonNullable<Me["branch"]> };
}
