"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { PageHeader } from "@/components/shell/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import {
  BadgeCell,
  CodeCell,
  NumberCell,
  TableEmpty,
  TableHead,
  TableRow,
  TextCell,
  type Column,
} from "@/components/ui/Table";
import type { Schemas } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { amount } from "@/lib/format";

export function ReceiptList({
  receipts,
  canReceive,
}: {
  receipts: Schemas["ReceiptList"][];
  canReceive: boolean;
}) {
  const t = useTranslations("purchases");
  const ar = useLocale() === "ar";
  const router = useRouter();
  const columns: Column[] = [
    { header: t("colNumber"), width: "110px" },
    { header: t("colSupplier"), width: "minmax(0,1fr)" },
    { header: t("colInvoice"), width: "120px" },
    { header: t("colDate"), width: "100px" },
    { header: t("colTotal"), width: "120px", numeric: true },
    { header: t("colStatus"), width: "110px" },
  ];
  return (
    <>
      <PageHeader
        title={t("listTitle")}
        actions={
          canReceive && (
            <Link href="/purchases/new" className={cn(buttonClasses({}), "no-underline")}>
              {t("newReceipt")}
            </Link>
          )
        }
      />
      <Panel title={t("receipts")}>
        <div role="table" aria-label={t("receipts")}>
          <TableHead columns={columns} />
          {receipts.map((r) => (
            <TableRow
              key={r.id}
              columns={columns}
              onActivate={() => router.push(`/purchases/${r.id}`)}
            >
              <CodeCell>{r.number || "—"}</CodeCell>
              <TextCell>{ar ? r.supplier.name_ar : r.supplier.name_en}</TextCell>
              <CodeCell>{r.supplier_invoice_no}</CodeCell>
              <CodeCell>{r.invoice_date}</CodeCell>
              <NumberCell>{amount(r.total)}</NumberCell>
              <BadgeCell tone={r.status === "posted" ? "success" : "info"}>
                {t(r.status ?? "draft")}
              </BadgeCell>
            </TableRow>
          ))}
          {receipts.length === 0 && <TableEmpty>{t("none")}</TableEmpty>}
        </div>
      </Panel>
    </>
  );
}
