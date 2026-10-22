"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiSend } from "@/lib/api/browser";

import { type CartLine, errorCode, type Quote, type QuoteLine, toLineIn } from "./types";

const QUOTE_DELAY_MS = 120;

export type QuoteState = {
  /** Cart version the quote was computed for. */
  version: number;
  quote: Quote | null;
  byKey: Record<string, QuoteLine>;
  error: { code: string; key?: string } | null;
};

const EMPTY: QuoteState = { version: 0, quote: null, byKey: {}, error: null };

type Draft = { lines: CartLine[]; pendingKey: string | null };

/**
 * The counter's cart. Totals always come from POST /sales/quote — the screen
 * never computes them. The draft survives reloads on this device.
 */
export function usePosCart(deviceId: string) {
  const storageKey = `raff.pos.draft.${deviceId}`;
  const [lines, setLinesState] = useState<CartLine[]>([]);
  const [version, setVersion] = useState(1);
  const [quoted, setQuoted] = useState<QuoteState>(EMPTY);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const loaded = useRef(false);

  // Restore after hydration (the server renders an empty cart).
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const draft = JSON.parse(raw) as Draft;
          setLinesState(draft.lines ?? []);
          setPendingKey(draft.pendingKey ?? null);
          setVersion((v) => v + 1);
        }
      } catch {
        // A broken draft is dropped; the cart starts empty.
      }
      loaded.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      if (lines.length || pendingKey) {
        localStorage.setItem(storageKey, JSON.stringify({ lines, pendingKey } satisfies Draft));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Storage full or blocked: the cart still works in memory.
    }
  }, [lines, pendingKey, storageKey]);

  useEffect(() => {
    const valid = lines.filter((l) => l.quantity >= 1);
    if (valid.length === 0) return;
    let live = true;
    const timer = setTimeout(async () => {
      const res = await apiSend<Quote>("POST", "/sales/quote/", { lines: valid.map(toLineIn) });
      if (!live) return;
      if (res.ok) {
        const byKey: Record<string, QuoteLine> = {};
        res.data.lines.forEach((q) => {
          const line = valid[q.line_no - 1];
          if (line) byKey[line.key] = q;
        });
        setQuoted({ version, quote: res.data, byKey, error: null });
      } else {
        const lineNo = Number(res.error?.line);
        setQuoted({
          version,
          quote: null,
          byKey: {},
          error: { code: errorCode(res.error), key: valid[lineNo - 1]?.key },
        });
      }
    }, QUOTE_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [lines, version]);

  const setLines = useCallback((update: (prev: CartLine[]) => CartLine[]) => {
    setLinesState(update);
    setVersion((v) => v + 1);
  }, []);

  const clear = useCallback(() => {
    setLines(() => []);
    setPendingKey(null);
  }, [setLines]);

  const hasValid = lines.some((l) => l.quantity >= 1);
  const current = hasValid ? quoted : { ...EMPTY, version };
  const fresh = current.version === version;
  const insufficient = lines.some((l) => {
    const q = current.byKey[l.key];
    return q ? q.available_base < q.base_quantity : false;
  });
  const ready =
    fresh &&
    lines.length > 0 &&
    current.quote !== null &&
    !current.error &&
    !insufficient &&
    lines.every((l) => l.quantity >= 1);

  return { lines, setLines, clear, quoted: current, ready, pendingKey, setPendingKey };
}
