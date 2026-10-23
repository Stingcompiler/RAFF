"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { ToastProvider } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { usePhone } from "@/lib/phone";

import { isPhoneScreen, PhoneNav } from "./PhoneNav";
import { PhoneStatus } from "./PhoneStatus";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { ShellContext } from "./types";

/**
 * Workspace frame: sidebar + top bar + independently scrolling content.
 * At ≤760px every screen gets the bottom navigation; the four screens drawn in
 * Raff Mobile also swap the top bar for the status strip.
 */
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
  const phone = usePhone();
  const pathname = usePathname();
  const phoneScreen = phone && isPhoneScreen(activePath ?? pathname);
  return (
    <ToastProvider dismissLabel={t("dismiss")}>
      <div className="relative flex h-dvh overflow-hidden bg-canvas text-text">
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
          {phoneScreen ? (
            <PhoneStatus
              status={context.connection.status}
              text={context.connection.text}
              onMenu={() => setDrawer(true)}
            />
          ) : (
            <TopBar context={context} onMenu={() => setDrawer(true)} />
          )}
          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-auto",
              phoneScreen ? "gap-0" : "gap-[16px] p-[24px]",
            )}
          >
            {children}
          </main>
          {phone && <PhoneNav activePath={activePath} />}
        </div>
      </div>
    </ToastProvider>
  );
}
