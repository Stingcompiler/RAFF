"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { ToastProvider } from "@/components/ui/Toast";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { ShellContext } from "./types";

/** Workspace frame: sidebar + top bar + independently scrolling content. */
export function AppShell({
  context,
  children,
  activePath,
}: {
  context: ShellContext;
  children: ReactNode;
  activePath?: string;
}) {
  const [drawer, setDrawer] = useState(false);
  const t = useTranslations("common");
  return (
    <ToastProvider dismissLabel={t("dismiss")}>
      <div className="relative flex h-dvh overflow-hidden bg-bg text-ink">
        <Sidebar
          context={context}
          open={drawer}
          onNavigate={() => setDrawer(false)}
          activePath={activePath}
        />
        {drawer && (
          <div
            aria-hidden="true"
            onClick={() => setDrawer(false)}
            className="fixed inset-0 z-[5] hidden bg-scrim/40 max-[760px]:block"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar context={context} onMenu={() => setDrawer(true)} />
          <main className="flex flex-1 flex-col gap-[16px] overflow-auto p-[24px]">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
