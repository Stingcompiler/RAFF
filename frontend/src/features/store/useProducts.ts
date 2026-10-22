"use client";

import { useEffect, useState } from "react";

import { apiGet } from "@/lib/api/browser";

import type { Product } from "./types";

/** Current published products by slug (prices and availability re-read from the server). */
export function useProducts(): { bySlug: Map<string, Product>; ready: boolean } {
  const [state, setState] = useState<{ bySlug: Map<string, Product>; ready: boolean }>({
    bySlug: new Map(),
    ready: false,
  });
  useEffect(() => {
    let live = true;
    void apiGet<Product[]>("/public/products/?limit=200").then((res) => {
      if (live)
        setState({
          bySlug: new Map((res.ok ? res.data : []).map((p) => [p.slug, p])),
          ready: true,
        });
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}
