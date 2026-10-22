import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { requireMe } from "@/lib/session";
import { getShellContext } from "@/lib/shell/context";

/** Every workspace screen except the POS sits in the sidebar shell. */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const me = await requireMe();
  return <AppShell context={await getShellContext(me)}>{children}</AppShell>;
}
