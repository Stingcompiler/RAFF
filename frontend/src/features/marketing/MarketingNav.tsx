"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandMark } from "@/components/ui/icons";

import { APP_HREF, BUTTON } from "./links";

type Labels = {
  brand: string;
  menu: string;
  close: string;
  label: string;
  open: string;
  lang: string;
  langHref: string;
  links: { href: string; label: string }[];
};

/**
 * The page's top bar. Wide screens: links, language, and the button. Phones: a menu button
 * that opens the same links and the button in a panel, so the way into Raff is always at hand.
 */
export function MarketingNav({ labels }: { labels: Labels }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const link =
    "inline-flex min-h-[44px] items-center rounded-control px-[12px] text-body font-medium text-text no-underline hover:bg-surface-subtle";

  return (
    <header className="sticky top-0 z-[10] border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center gap-[16px] px-[20px] py-[10px]">
        <Link
          href="#top"
          className="hit-44 flex items-center gap-[8px] text-section font-bold text-brand no-underline"
        >
          <BrandMark size={26} />
          {labels.brand}
        </Link>
        <nav aria-label={labels.label} className="ms-[16px] flex gap-[2px] max-[760px]:hidden">
          {labels.links.map((l) => (
            <a key={l.href} href={l.href} className={link}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-[8px]">
          <a href={labels.langHref} className={`${link} max-[760px]:hidden`}>
            {labels.lang}
          </a>
          <Link href={APP_HREF} className={`${BUTTON} !min-h-[44px] !px-[18px] max-[760px]:hidden`}>
            {labels.open}
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="marketing-menu"
            aria-label={open ? labels.close : labels.menu}
            onClick={() => setOpen((v) => !v)}
            className="hidden size-[44px] cursor-pointer place-items-center rounded-control border border-border-strong bg-transparent text-text max-[760px]:grid"
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="marketing-menu"
          aria-label={labels.label}
          className="hidden gap-[4px] border-t border-border bg-surface px-[20px] py-[12px] max-[760px]:grid"
        >
          {labels.links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className={link}>
              {l.label}
            </a>
          ))}
          <a href={labels.langHref} className={link}>
            {labels.lang}
          </a>
          <Link href={APP_HREF} className={`${BUTTON} mt-[8px]`}>
            {labels.open}
          </Link>
        </nav>
      )}
    </header>
  );
}
