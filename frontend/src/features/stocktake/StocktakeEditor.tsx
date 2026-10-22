"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Panel } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
import {
  NumberCell,
  TableEmpty,
  TableHead,
  TableRow,
  TextCell,
  type Column,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { money, timeOfDay } from "@/lib/format";

import {
  errorCode,
  errorKey,
  inUnits,
  scopeLabel,
  signed,
  type TakeDetail,
  type TakeLine,
} from "./labels";

type Draft = Record<string, { units: string; reason: string }>;
const DASH = "—";

/** Count against the snapshot, then approve with its financial effect (Raff Screens › الجرد). */
export function StocktakeEditor({ initial, canCount }: { initial: TakeDetail; canCount: boolean }) {
  const t = useTranslations("stocktake");
  const tErr = useTranslations("stocktake.errors");
  const tCommon = useTranslations("common");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const [take, setTake] = useState(initial);
  const [draft, setDraft] = useState<Draft>({});
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const editable = canCount && take.status === "draft";

  const changed = Object.entries(draft).map(([line_id, d]) => ({
    line_id,
    counted_units: d.units.trim() === "" ? null : Number(d.units),
    reason: d.reason,
  }));

  const save = async (): Promise<TakeDetail | null> => {
    if (changed.length === 0) return take;
    setBusy("save");
    const res = await apiSend<TakeDetail>("PATCH", `/stocktakes/${take.id}/`, { lines: changed });
    setBusy(null);
    if (!res.ok) {
      toast.push("danger", tErr(errorKey(errorCode(res.error))));
      return null;
    }
    setTake(res.data);
    setDraft({});
    return res.data;
  };

  const review = async () => {
    const saved = await save();
    if (saved) setConfirm(true);
  };

  const approve = async () => {
    const k = key ?? crypto.randomUUID();
    setKey(k);
    setBusy("approve");
    const res = await apiSend("POST", `/stocktakes/${take.id}/approve/`, undefined, {
      idempotencyKey: k,
    });
    setBusy(null);
    setConfirm(false);
    if (!res.ok) {
      if (res.status !== 0) setKey(null);
      return toast.push("danger", tErr(errorKey(errorCode(res.error))));
    }
    toast.push("success", t("approved"));
    const fresh = await apiGet<TakeDetail>(`/stocktakes/${take.id}/`);
    if (fresh.ok) setTake(fresh.data);
  };

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q
      ? take.lines.filter((l) =>
          [l.code, l.name_ar, l.name_en].some((v) => v.toLowerCase().includes(q)),
        )
      : take.lines;
  }, [take.lines, filter]);

  const impact = Number(take.impact);
  const withVariance = take.lines.filter((l) => (l.variance_base ?? 0) !== 0).length;
  const columns: Column[] = [
    { header: t("colItem"), width: "minmax(0,1fr)" },
    { header: t("colSystem"), width: "80px", numeric: true },
    { header: t("colCounted"), width: "90px", numeric: true },
    { header: t("colDiff"), width: "90px", numeric: true },
    { header: t("colRowStatus"), width: "130px" },
  ];
  const status = (line: TakeLine) => {
    if (line.variance_base === null) return null;
    if (line.variance_base === 0)
      return (
        <Badge tone="success" dense>
          {t("match")}
        </Badge>
      );
    const label = line.variance_base < 0 ? t("short") : t("over");
    const text =
      line.reason_required && !line.reason ? [label, t("reasonNeeded")].join(" — ") : label;
    return (
      <Badge tone={line.variance_base < 0 ? "warn" : "info"} dense>
        {text}
      </Badge>
    );
  };

  return (
    <>
      <PageHeader
        title={t("titleFor", { scope: scopeLabel(take, ar, t) })}
        actions={
          editable && (
            <>
              <Button
                variant="outline"
                disabled={busy !== null || changed.length === 0}
                onClick={() => void save().then((s) => s && toast.push("success", t("saved")))}
              >
                {t("save")}
              </Button>
              <Button disabled={busy !== null} onClick={() => void review()}>
                {t("approve")}
              </Button>
            </>
          )
        }
      />
      <div className="mb-[16px] grid grid-cols-3 gap-[16px]">
        <StatTile
          label={t("tileScope")}
          value={scopeLabel(take, ar, t)}
          note={t("snapshot", { time: timeOfDay(take.snapshot_at) })}
        />
        <StatTile label={t("tileCounted")} value={[take.counted, take.total].join(" / ")} />
        <StatTile
          label={t("tileImpact")}
          value={money(take.impact, ar ? "ar" : "en") || money("0", ar ? "ar" : "en")}
          note={impact < 0 ? t("shortage") : impact > 0 ? t("overage") : t("even")}
        />
      </div>
      <Panel
        title={t("count")}
        chips={
          <input
            type="search"
            aria-label={t("filter")}
            placeholder={t("filter")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="ms-auto h-[30px] w-[200px] rounded-full border border-line bg-transparent px-[12px] text-[13px] text-ink outline-none focus:border-primary"
          />
        }
      >
        <div role="table" aria-label={t("count")}>
          <TableHead columns={columns} />
          {rows.map((line) => {
            const d = draft[line.id];
            const name = ar ? line.name_ar : line.name_en;
            const shownUnits = d
              ? d.units
              : line.counted_base === null
                ? ""
                : String(Math.floor(line.counted_base / (line.factor || 1)));
            const needReason = line.reason_required || (d?.reason ?? "") !== "";
            return (
              <div key={line.id}>
                <TableRow columns={columns}>
                  <TextCell>
                    {name}{" "}
                    <bdi dir="ltr" className="text-[12px] text-muted">
                      {line.strength}
                    </bdi>
                  </TextCell>
                  <NumberCell>{inUnits(line.system_base, line.factor)}</NumberCell>
                  <span role="cell">
                    {editable ? (
                      <input
                        dir="ltr"
                        type="number"
                        min={0}
                        aria-label={t("countedFor", { item: name })}
                        value={shownUnits}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [line.id]: {
                              units: e.target.value,
                              reason: prev[line.id]?.reason ?? line.reason,
                            },
                          }))
                        }
                        className="h-[32px] w-full rounded-[6px] border border-line bg-surface px-[6px] text-end text-ink tabular-nums"
                      />
                    ) : (
                      <span className="block text-end tabular-nums">
                        {line.counted_base === null
                          ? DASH
                          : inUnits(line.counted_base, line.factor)}
                      </span>
                    )}
                  </span>
                  <NumberCell>
                    <span
                      className={cn(
                        (line.variance_base ?? 0) < 0 && "text-warn",
                        (line.variance_base ?? 0) > 0 && "text-info",
                      )}
                    >
                      {line.variance_base === null ? DASH : signed(line.variance_base, line.factor)}
                    </span>
                  </NumberCell>
                  <span role="cell">{status(line)}</span>
                </TableRow>
                {editable && needReason && (
                  <div className="border-b border-line bg-surface-raised px-[16px] py-[6px]">
                    <input
                      aria-label={[t("reason"), name].join(" — ")}
                      placeholder={t("reason")}
                      value={d?.reason ?? line.reason}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [line.id]: {
                            units:
                              prev[line.id]?.units ??
                              (line.counted_base === null
                                ? ""
                                : String(Math.floor(line.counted_base / (line.factor || 1)))),
                            reason: e.target.value,
                          },
                        }))
                      }
                      className="h-[30px] w-full rounded-[6px] border border-line bg-surface px-[8px] text-[13px] text-ink"
                    />
                  </div>
                )}
              </div>
            );
          })}
          {rows.length === 0 && <TableEmpty>{DASH}</TableEmpty>}
        </div>
      </Panel>
      <ConfirmDialog
        open={confirm}
        title={t("confirmTitle")}
        body={t("confirmBody")}
        impact={[
          { label: t("tileImpact"), value: money(take.impact, ar ? "ar" : "en") || "0" },
          { label: t("itemsVariance"), value: String(withVariance) },
        ]}
        cancelLabel={tCommon("back")}
        confirmLabel={t("approve")}
        busyLabel={t("approving")}
        busy={busy === "approve"}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void approve()}
      />
    </>
  );
}
