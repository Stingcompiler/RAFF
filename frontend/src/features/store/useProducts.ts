"use client";

import { useCallback, useEffect, useState } from "react";

import { apiGet } from "@/lib/api/browser";

import type { Product } from "./types";

type State = { bySlug: Map<string, Product>; ready: boolean; failed: boolean };

/** The current published data of exactly these items (prices and availability from the
 * server). `failed` means the server could not be read: the cart says so instead of looking
 * empty (review C-03). */
export function useProducts(slugs: string[]): State & { retry: () => void } {
  const key = [...new Set(slugs)].sort().join(",");
  const [state, setState] = useState<State>({ bySlug: new Map(), ready: false, failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    if (!key) {
      const timer = setTimeout(() => {
        if (live) setState({ bySlug: new Map(), ready: true, failed: false });
      }, 0);
      return () => {
        live = false;
        clearTimeout(timer);
      };
    }
    void apiGet<Product[]>(`/public/products/?slugs=${encodeURIComponent(key)}`).then((res) => {
      if (live)
        setState({
          bySlug: new Map((res.ok ? res.data : []).map((p) => [p.slug, p])),
          ready: true,
          failed: !res.ok,
        });
    });
    return () => {
      live = false;
    };
  }, [key, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
