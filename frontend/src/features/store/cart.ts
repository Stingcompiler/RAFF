"use client";

import { useSyncExternalStore } from "react";

/** The guest's cart: item slugs and quantities only, on this device. Prices are always
 * re-read from the server; nothing here is trusted for the order. */
export type CartLine = { slug: string; qty: number };

const KEY = "raff.store.cart.v1";
const MAX_QTY = 20;
const listeners = new Set<() => void>();
let cache: CartLine[] | null = null;
const EMPTY: CartLine[] = [];

function read(): CartLine[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    cache = parsed.filter((l) => typeof l.slug === "string" && l.qty > 0);
  } catch {
    cache = [];
  }
  return cache;
}

function write(lines: CartLine[]) {
  cache = lines;
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Storage blocked: the cart still works for this page view.
  }
  listeners.forEach((l) => l());
}

export const cart = {
  add(slug: string, qty = 1) {
    const lines = read();
    const found = lines.find((l) => l.slug === slug);
    write(
      found
        ? lines.map((l) => (l.slug === slug ? { ...l, qty: Math.min(MAX_QTY, l.qty + qty) } : l))
        : [...lines, { slug, qty: Math.min(MAX_QTY, qty) }],
    );
  },
  set(slug: string, qty: number) {
    write(
      qty <= 0
        ? read().filter((l) => l.slug !== slug)
        : read().map((l) => (l.slug === slug ? { ...l, qty: Math.min(MAX_QTY, qty) } : l)),
    );
  },
  clear() {
    write([]);
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
