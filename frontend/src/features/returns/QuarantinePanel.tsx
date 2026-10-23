"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Panel } from "@/components/ui/Panel";
import {
  CodeCell,
  NumberCell,
  TableEmpty,
  TableHead,
  TableRow,
  TextCell,
  type Column,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/api/browser";

import { RecallDialog } from "./RecallDialog";
import { type Decision, errorCode, errorKey, packs, type QuarantineRow } from "./types";

const DECISIONS: Decision[] = ["restock", "destroy", "return"];

type Props = { rows: QuarantineRow[]; canDecide: boolean; onChanged: () => void };

/** Quarantine awaiting the responsible pharmacist: restock, destroy or return to supplier. */
export function QuarantinePanel({ rows, canDecide, onChanged }: Props) {
  const t = useTranslations("returns");
  const tErr = useTranslations("returns.errors");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const [pending, setPending] = useState<{
    row: QuarantineRow;
    decision: Decision;
    key: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [recall, setRecall] = useState(false);

  const decide = async () => {
    if (!pending) return;
    setBusy(true);
    const res = await apiSend(
      "POST",
      `/quarantine/${pending.row.id}/decide/`,
      { decision: pending.decision },
      { idempotencyKey: pending.key },
    );
    setBusy(false);
    setPending(null);
    if (!res.ok) return toast.push("danger", tErr(errorKey(errorCode(res.error))));
    toast.push("success", t("decided"));
    onChanged();
  };

  const columns: Column[] = [
    { header: t("colItem"), width: "minmax(0,1fr)" },
    { header: t("colBatch"), width: "70px" },
    { header: t("colQty"), width: "70px", numeric: true },
    { header: t("colDecision"), width: "1.3fr" },
  ];
  return (
    <Panel
      title={t("quarantine")}
      note={t("pharmacist")}
      chips={
        canDecide && (
          <Button
            variant="outline"
            size="md"
            className="ms-auto h-[32px]"
            onClick={() => setRecall(true)}
          >
            {t("recall")}
          </Button>
        )
      }
    >
      <div role="table" aria-label={t("quarantine")}>
        <TableHead columns={columns} />
        {rows.map((row) => {
          const name = ar ? row.item_name_ar : row.item_name_en;
          return (
            <TableRow key={row.id} columns={columns}>
              <TextCell>
                {name}{" "}
                <bdi dir="ltr" className="text-[12px] text-text-muted">
                  {row.strength}
                </bdi>
              </TextCell>
              <CodeCell>{row.batch_no}</CodeCell>
              <NumberCell>{packs(row.quantity_base, row.unit, ar)}</NumberCell>
              <span role="cell" className="flex flex-wrap items-center gap-[6px] py-[4px]">
                {row.source === "recall" && (
                  <Badge tone="warn" dense>
                    {t("recallBadge")}
                  </Badge>
                )}
                {row.expired && (
                  <span className="text-[12px] text-danger-text">{t("suggestDestroy")}</span>
                )}
                {canDecide ? (
                  DECISIONS.filter((d) => !(d === "restock" && row.expired)).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setPending({ row, decision: d, key: crypto.randomUUID() })}
                      className="type-inherit cursor-pointer rounded-[6px] border border-border-strong bg-transparent px-[8px] py-[2px] text-[12px] text-text hover:bg-surface-subtle"
                    >
                      {t(`decision.${d}`)}
                    </button>
                  ))
                ) : (
                  <Badge tone="warn" dense>
                    {t("toInspect")}
                  </Badge>
                )}
              </span>
            </TableRow>
          );
        })}
        {rows.length === 0 && <TableEmpty>{t("noQuarantine")}</TableEmpty>}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={
          pending
            ? t("decideTitle", {
                decision: t(`decision.${pending.decision}`),
                item: ar ? pending.row.item_name_ar : pending.row.item_name_en,
              })
            : ""
        }
        body={t("decideBody")}
        impact={
          pending
            ? [
                { label: t("batch"), value: pending.row.batch_no },
                {
                  label: t("quantity"),
                  value: packs(pending.row.quantity_base, pending.row.unit, ar),
                },
              ]
            : []
        }
        cancelLabel={t("cancel")}
        confirmLabel={pending ? t(`decision.${pending.decision}`) : ""}
        busyLabel={t("approving")}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void decide()}
      />
      {recall && (
        <RecallDialog
          onClose={() => setRecall(false)}
          onDone={() => {
            setRecall(false);
            toast.push("success", t("recallDone"));
            onChanged();
          }}
        />
      )}
    </Panel>
  );
}
