"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConnectionIndicator } from "@/components/ui/ConnectionIndicator";

import type { ShellContext } from "./types";
import { UserMenu } from "./UserMenu";

export function TopBar({ context, onMenu }: { context: ShellContext; onMenu: () => void }) {
  const t = useTranslations("shell");
  return (
    <header className="flex h-[52px] flex-none items-center gap-[16px] border-b border-line bg-surface-raised px-[24px]">
      <button
        type="button"
        aria-label={t("menu")}
        onClick={onMenu}
        className="hidden size-[44px] cursor-pointer place-items-center rounded-[10px] border border-line bg-transparent text-ink max-[760px]:grid"
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <span className="flex-1 text-[13px] text-muted">{context.branchLine}</span>
      <ConnectionIndicator status={context.connection.status} label={context.connection.text} />
      <UserMenu name={context.user.name} initial={context.user.initial} />
    </header>
  );
}
