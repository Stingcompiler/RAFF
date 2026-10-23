"use client";

import { useSyncExternalStore } from "react";

/** Same breakpoint as the shell drawer and Tailwind's `max-[760px]` (Raff Mobile). */
const QUERY = "(max-width: 760px)";

const subscribe = (notify: () => void) => {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", notify);
  return () => list.removeEventListener("change", notify);
};

/** True on a phone-sized viewport. The server and the first client render say false. */
export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
