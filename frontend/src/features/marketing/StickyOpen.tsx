"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { APP_HREF, BUTTON } from "./links";

const SCROLLED_PX = 520;

/** On a phone, once the first screen is behind you, the button to open Raff follows you. */
export function StickyOpen({ label }: { label: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > SCROLLED_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!shown) return null;
  return (
    <div
      data-testid="sticky-open"
      className="fixed inset-x-0 bottom-0 z-[9] hidden border-t border-border bg-surface px-[20px] py-[10px] max-[760px]:block"
    >
      <Link href={APP_HREF} className={`${BUTTON} w-full`}>
        {label}
      </Link>
    </div>
  );
}
