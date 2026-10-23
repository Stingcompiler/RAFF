"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { TONE_CLASSES, type Tone } from "@/components/ui/Badge";
import { TONE_SYMBOL } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/api/browser";
import { cn } from "@/lib/cn";

import { BarcodeCamera } from "./BarcodeCamera";
import { inUnits, scopeLabel, type Take, type TakeDetail, type TakeLine } from "./labels";

type Cam = "on" | "denied";
type Found = { results: { id: string }[] };

const MINUS = "−";
const PLUS = "+";

const unitsOf = (line: TakeLine) =>
  line.counted_base === null ? 0 : Math.floor(line.counted_base / (line.factor || 1));

const nextOpen = (lines: TakeLine[], after?: string) => {
  const from = after ? lines.findIndex((l) => l.id === after) + 1 : 0;
  return (
    [...lines.slice(from), ...lines.slice(0, from)].find((l) => l.counted_base === null) ?? null
  );
};

/** Raff Mobile › 2 · جرد بالكاميرا: scan an item, set the count, confirm — one item at a time. */
export function PhoneCount({ takes, canCount }: { takes: Take[]; canCount: boolean }) {
  const t = useTranslations("phone.count");
  const tStock = useTranslations("stocktake");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const draft = takes.find((x) => x.status === "draft") ?? null;
  const [take, setTake] = useState<TakeDetail | null>(null);
  const [loading, setLoading] = useState(draft !== null);
  const [lineId, setLineId] = useState<string | null>(null);
  const [units, setUnits] = useState("0");
  const [cam, setCam] = useState<Cam>("on");
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const take$ = useRef<TakeDetail | null>(null);

  useEffect(() => {
    take$.current = take;
  });

  const choose = useCallback((line: TakeLine | null) => {
    setLineId(line?.id ?? null);
    setUnits(line ? String(unitsOf(line)) : "0");
  }, []);

  useEffect(() => {
    if (!draft) return;
    let live = true;
    void apiGet<TakeDetail>(`/stocktakes/${draft.id}/`).then((res) => {
      if (!live) return;
      setLoading(false);
      if (res.ok) {
        setTake(res.data);
        choose(nextOpen(res.data.lines));
      }
    });
    return () => {
      live = false;
    };
  }, [draft, choose]);

  const find = useCallback(
    async (code: string) => {
      const current = take$.current;
      const value = code.trim();
      if (!current || !value) return;
      const res = await apiGet<Found>(
        `/inventory/items/?${new URLSearchParams({ q: value, limit: "10", active: "all" })}`,
      );
      const ids = new Set(res.ok ? res.data.results.map((r) => r.id) : []);
      const line = current.lines.find((l) => ids.has(l.item_id));
      if (!line) return setNote(t("notFound"));
      setNote(null);
      setManual(false);
      setQuery("");
      choose(line);
    },
    [choose, t],
  );

  const start = async () => {
    setBusy(true);
    const res = await apiSend<TakeDetail>("POST", "/stocktakes/", { category_id: null });
    setBusy(false);
    if (!res.ok) return toast.push("danger", t("failed"));
    setTake(res.data);
    choose(nextOpen(res.data.lines));
  };

  const line = take?.lines.find((l) => l.id === lineId) ?? null;
  const editable = canCount && take?.status === "draft";
  const factor = line?.factor || 1;
  const parsed = units.trim() === "" ? null : Number(units);
  const valid = parsed !== null && Number.isInteger(parsed) && parsed >= 0 && parsed <= 99999;
  const diff = line && valid ? parsed * factor - line.system_base : 0;

  const confirm = async () => {
    if (!take || !line || !valid) return;
    setBusy(true);
    const res = await apiSend<TakeDetail>("PATCH", `/stocktakes/${take.id}/`, {
      lines: [{ line_id: line.id, counted_units: parsed, reason: line.reason }],
    });
    setBusy(false);
    if (!res.ok) return toast.push("danger", t("failed"));
    toast.push("success", t("saved"));
    setTake(res.data);
    choose(nextOpen(res.data.lines, line.id));
  };

  const diffTone: Tone = diff === 0 ? "success" : diff < 0 ? "warn" : "info";
  const diffText =
    diff === 0
      ? t("match")
      : diff < 0
        ? t("short", { n: inUnits(-diff, factor) })
        : t("over", { n: inUnits(diff, factor) });
  const step = (by: number) => setUnits(String(Math.max(0, (valid ? parsed : 0) + by)));
  const allDone = take !== null && take.lines.length > 0 && take.counted >= take.total;

  return (
    <>
      <div className="px-[16px] pt-[8px] pb-[12px]">
        <h1 className="m-0 type-page">{t("title")}</h1>
        {take && (
          <div className="text-[13px] text-text-muted">
            {t("scope", {
              scope: scopeLabel(take, ar, tStock),
              counted: take.counted,
              total: take.total,
            })}
          </div>
        )}
      </div>
      <div className="grid flex-1 content-start gap-[12px] px-[16px] pb-[16px]">
        {!loading && !take && (
          <div className="grid justify-items-center gap-[12px] rounded-card border border-border bg-surface p-[24px] text-center">
            <p className="m-0 text-text-muted">{canCount ? t("noTake") : t("noPermission")}</p>
            {canCount && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void start()}
                className="min-h-[52px] w-full cursor-pointer rounded-card border-0 bg-brand font-[inherit] text-[16px] font-semibold text-on-brand disabled:opacity-60"
              >
                {busy ? t("starting") : t("startTake")}
              </button>
            )}
          </div>
        )}
        {take && !editable && (
          <div className="rounded-card border border-border bg-surface p-[16px] text-center text-text-muted">
            {canCount ? t("approved") : t("noPermission")}
          </div>
        )}
        {take && editable && (
          <>
            {cam === "on" ? (
              <BarcodeCamera
                onCode={(code) => void find(code)}
                onUnavailable={() => setCam("denied")}
              />
            ) : (
              <div className="grid h-[180px] animate-[raff-fade_var(--motion-scene)_ease_both] content-center justify-items-center gap-[8px] rounded-card bg-danger-bg p-[16px] text-center text-danger-text">
                <div className="font-semibold">
                  {TONE_SYMBOL.danger} {t("camTitle")}
                </div>
                <div className="text-[13px]">{t("camBody")}</div>
                <button
                  type="button"
                  onClick={() => setManual(true)}
                  className="min-h-[44px] cursor-pointer rounded-control border border-danger-solid bg-transparent px-[16px] font-[inherit] font-medium text-danger-text"
                >
                  {t("camManual")}
                </button>
              </div>
            )}
            {(manual || cam === "denied") && (
              <form
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  void find(query);
                }}
                className="flex gap-[8px]"
              >
                <input
                  dir="auto"
                  aria-label={t("manualLabel")}
                  placeholder={t("manualLabel")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-[48px] min-w-0 flex-1 rounded-card border-2 border-brand bg-surface px-[14px] text-[16px] text-text outline-none"
                />
                <button
                  type="submit"
                  className="min-h-[48px] cursor-pointer rounded-card border-0 bg-brand px-[16px] font-[inherit] font-semibold text-on-brand"
                >
                  {t("find")}
                </button>
              </form>
            )}
            {note && (
              <div role="status" className="text-center text-[13px] text-warning-text">
                {TONE_SYMBOL.warn} {note}
              </div>
            )}
            {line ? (
              <>
                <section className="grid gap-[12px] rounded-card border border-border bg-surface p-[14px]">
                  <div className="flex items-center justify-between gap-[8px]">
                    <span className="min-w-0 font-medium">
                      {[ar ? line.name_ar : line.name_en, line.strength].filter(Boolean).join(" ")}
                    </span>
                    <span className="flex-none text-[13px] whitespace-nowrap text-text-muted">
                      {t("system")}{" "}
                      <b dir="ltr" className="text-text">
                        {inUnits(line.system_base, factor)}
                      </b>
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-[16px]">
                    <button
                      type="button"
                      aria-label={t("decrease")}
                      onClick={() => step(-1)}
                      className="size-[56px] cursor-pointer rounded-card border border-border bg-surface-subtle text-[26px] text-text transition-transform duration-(--motion-feedback)"
                    >
                      {MINUS}
                    </button>
                    <input
                      dir="ltr"
                      inputMode="numeric"
                      aria-label={t("countLabel")}
                      value={units}
                      onChange={(e) => setUnits(e.target.value.replace(/\D/g, "").slice(0, 5))}
                      className="w-[90px] border-0 bg-transparent p-0 text-center text-[44px] font-medium text-text tabular-nums outline-none"
                    />
                    <button
                      type="button"
                      aria-label={t("increase")}
                      onClick={() => step(1)}
                      className="size-[56px] cursor-pointer rounded-card border-0 bg-brand text-[26px] text-on-brand transition-transform duration-(--motion-feedback)"
                    >
                      {PLUS}
                    </button>
                  </div>
                  <div
                    className={cn(
                      "justify-self-center rounded-pill border px-[11px] py-[3px] text-[13px] font-medium transition-[background,color] duration-(--motion-feedback)",
                      TONE_CLASSES[diffTone],
                    )}
                  >
                    {TONE_SYMBOL[diffTone]} {diffText}
                  </div>
                </section>
                <button
                  type="button"
                  disabled={busy || !valid}
                  onClick={() => void confirm()}
                  className="h-[52px] cursor-pointer rounded-card border-0 bg-brand font-[inherit] text-[16px] font-semibold text-on-brand transition-transform duration-(--motion-feedback) disabled:opacity-60"
                >
                  {t("confirm")}
                </button>
              </>
            ) : (
              <div className="rounded-card border border-border bg-surface p-[16px] text-center text-text-muted">
                {allDone ? t("allDone") : t("pick")}
              </div>
            )}
            <div className="text-center text-[12px] text-text-muted">
              {t("counted", { count: take.counted })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
