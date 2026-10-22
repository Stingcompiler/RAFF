"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
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
import { apiGet } from "@/lib/api/browser";
import { amount } from "@/lib/format";

import { QuarantinePanel } from "./QuarantinePanel";
import { ReturnForm } from "./ReturnForm";
import type { QuarantineRow, ReturnRow } from "./types";

type Props = {
  initialReturns: ReturnRow[];
  initialQuarantine: QuarantineRow[];
  canReturn: boolean;
  canDecide: boolean;
};

/** Returns & quarantine (Raff Screens › المرتجعات والحجر). */
export function ReturnsScreen({ initialReturns, initialQuarantine, canReturn, canDecide }: Props) {
  const t = useTranslations("returns");
  const [returns, setReturns] = useState(initialReturns);
  const [quarantine, setQuarantine] = useState(initialQuarantine);
  const [formKey, setFormKey] = useState(0);

  const refresh = useCallback(async () => {
    const [r, q] = await Promise.all([
      apiGet<ReturnRow[]>("/returns/"),
      apiGet<QuarantineRow[]>("/quarantine/"),
    ]);
    if (r.ok) setReturns(r.data);
    if (q.ok) setQuarantine(q.data);
  }, []);

  const columns: Column[] = [
    { header: t("colNumber"), width: "110px" },
    { header: t("colInvoice"), width: "110px" },
    { header: t("colRefund"), width: "minmax(0,1fr)" },
    { header: t("colDate"), width: "140px" },
    { header: t("colAmount"), width: "110px", numeric: true },
  ];
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          canReturn && <Button onClick={() => setFormKey((k) => k + 1)}>{t("newReturn")}</Button>
        }
      />
      <div className="grid grid-cols-12 items-start gap-[16px]">
        {canReturn && (
          <section className="col-span-6 min-w-0 max-[1180px]:col-span-12">
            <ReturnForm key={formKey} onPosted={() => void refresh()} />
          </section>
        )}
        <section className="col-span-6 min-w-0 max-[1180px]:col-span-12">
          <QuarantinePanel
            rows={quarantine}
            canDecide={canDecide}
            onChanged={() => void refresh()}
          />
        </section>
        <section className="col-span-12 min-w-0">
          <Panel title={t("recent")}>
            <div role="table" aria-label={t("recent")}>
              <TableHead columns={columns} />
              {returns.map((r) => (
                <TableRow key={r.id} columns={columns}>
                  <CodeCell>{r.number}</CodeCell>
                  <CodeCell>{r.sale_number}</CodeCell>
                  <TextCell>{t(`refundMethod.${r.refund_method}`)}</TextCell>
                  <CodeCell>{r.posted_at.slice(0, 16).replace("T", " ")}</CodeCell>
                  <NumberCell>{amount(r.total)}</NumberCell>
                </TableRow>
              ))}
              {returns.length === 0 && <TableEmpty>{t("noReturns")}</TableEmpty>}
            </div>
          </Panel>
        </section>
      </div>
    </>
  );
}
