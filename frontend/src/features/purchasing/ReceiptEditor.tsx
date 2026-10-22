"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Panel } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
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
import { amount, money } from "@/lib/format";

import { LineDialog } from "./LineDialog";
import { SupplierDialog } from "./SupplierDialog";
import { fromLine, type LineDraft, type Receipt, type Supplier } from "./types";

const TERMS = [0, 15, 30, 45, 60, 90];
const DASH = "—";
const ERRORS = [
  "supplier_invoice_exists",
  "receipt_posted",
  "no_lines",
  "batch_required",
  "batch_expiry_mismatch",
  "discount_exceeds_line",
] as const;

const field =
  "h-[44px] rounded-[8px] border border-line bg-bg px-[12px] py-0 text-[14px] font-normal text-ink outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--color-focus)] disabled:opacity-100";
const label = "grid gap-[4px] text-[12px] font-medium text-muted";

type Props = { initial: Receipt | null; suppliers: Supplier[] };

/** Goods receipt (Raff Screens › استلام مشتريات). */
export function ReceiptEditor({ initial, suppliers: initialSuppliers }: Props) {
  const t = useTranslations("purchases");
  const locale = useLocale();
  const ar = locale === "ar";
  const router = useRouter();
  const toast = useToast();
  const [receipt, setReceipt] = useState<Receipt | null>(initial);
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState(initial?.supplier.id ?? "");
  const [invoiceNo, setInvoiceNo] = useState(initial?.supplier_invoice_no ?? "");
  const [date, setDate] = useState(initial?.invoice_date ?? new Date().toISOString().slice(0, 10));
  const [terms, setTerms] = useState(initial?.payment_terms_days ?? 30);
  const [lines, setLines] = useState<LineDraft[]>(initial?.lines.map(fromLine) ?? []);
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [newSupplier, setNewSupplier] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [postKey, setPostKey] = useState<string | null>(null);
  const posted = receipt?.status === "posted";

  function errorText(err: Record<string, unknown> | null) {
    const code = typeof err?.detail === "string" ? err.detail : "";
    const key = ERRORS.find((k) => k === code);
    return key ? t(`errors.${key}`) : t("errors.failed");
  }

  async function persist(next: LineDraft[]): Promise<Receipt | null> {
    if (!supplierId || !invoiceNo || !date) {
      toast.push("warn", t("pickSupplier"));
      return null;
    }
    setBusy(true);
    const body = {
      supplier_id: supplierId,
      supplier_invoice_no: invoiceNo,
      invoice_date: date,
      payment_terms_days: terms,
      notes: "",
      lines: next.map((l) => ({
        item_id: l.item_id,
        unit_id: l.unit_id,
        quantity: l.quantity,
        bonus_quantity: l.bonus_quantity,
        unit_cost: l.unit_cost,
        discount: l.discount,
        batch_no: l.batch_no,
        expiry_date: l.expiry_date,
      })),
    };
    const res = receipt
      ? await apiSend<Receipt>("PUT", `/purchasing/receipts/${receipt.id}/`, body)
      : await apiSend<Receipt>("POST", "/purchasing/receipts/", body);
    setBusy(false);
    if (!res.ok) {
      toast.push("danger", errorText(res.error));
      return null;
    }
    setReceipt(res.data);
    setLines(res.data.lines.map(fromLine));
    if (!receipt) router.replace(`/purchases/${res.data.id}`);
    return res.data;
  }

  async function saveLine(line: LineDraft) {
    const index = editing?.index ?? null;
    const next = index === null ? [...lines, line] : lines.map((l, i) => (i === index ? line : l));
    setEditing(null);
    await persist(next);
  }

  async function removeLine() {
    const index = editing?.index;
    setEditing(null);
    if (index === null || index === undefined) return;
    await persist(lines.filter((_, i) => i !== index));
  }

  async function approve() {
    if (!receipt) return;
    const key = postKey ?? crypto.randomUUID();
    setPostKey(key);
    setBusy(true);
    const res = await apiSend<{ number: string }>(
      "POST",
      `/purchasing/receipts/${receipt.id}/post/`,
      undefined,
      {
        idempotencyKey: key,
      },
    );
    setBusy(false);
    if (!res.ok) {
      setConfirm(false);
      toast.push("danger", errorText(res.error));
      return;
    }
    setConfirm(false);
    setPostKey(null);
    toast.push("success", t("approved"));
    router.refresh();
    setReceipt({ ...receipt, status: "posted", number: res.data.number });
  }

  const columns: Column[] = [
    { header: t("colItem"), width: "minmax(0,1.4fr)" },
    { header: t("colUnit"), width: "60px" },
    { header: t("colQty"), width: "50px", numeric: true },
    { header: t("colBonus"), width: "50px", numeric: true },
    { header: t("colCost"), width: "80px", numeric: true },
    { header: t("colBatch"), width: "80px" },
    { header: t("colExpiry"), width: "95px" },
    { header: t("colStatus"), width: "150px" },
  ];
  const held = lines.filter((l) => !l.expiry_date).length;

  return (
    <>
      <PageHeader
        title={posted ? `${t("title")} · ${receipt?.number}` : t("title")}
        actions={
          posted ? (
            <Badge tone="success">{t("posted")}</Badge>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void persist(lines).then((r) => r && toast.push("success", t("saved")))
                }
              >
                {t("saveDraft")}
              </Button>
              <Button
                disabled={busy || !receipt || lines.length === 0}
                onClick={() => setConfirm(true)}
              >
                {t("approve")}
              </Button>
            </>
          )
        }
      />
      <div className="grid grid-cols-12 items-start gap-[16px]">
        <section className="col-span-4 min-w-0 max-[1180px]:col-span-12">
          <Panel title={t("header")}>
            <form
              className="grid gap-[12px] p-[16px]"
              onSubmit={(e) => {
                e.preventDefault();
                void persist(lines).then((r) => r && toast.push("success", t("saved")));
              }}
            >
              <label className={label}>
                {t("supplier")}
                <select
                  aria-label={t("supplier")}
                  className={`${field} box-content appearance-none`}
                  value={supplierId}
                  disabled={posted}
                  required
                  onChange={(e) =>
                    e.target.value === "+" ? setNewSupplier(true) : setSupplierId(e.target.value)
                  }
                >
                  <option value="">{t("pickSupplier")}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {ar ? s.name_ar : s.name_en}
                    </option>
                  ))}
                  <option value="+">{t("newSupplier")}</option>
                </select>
              </label>
              <label className={label}>
                {t("invoiceNo")}
                <input
                  dir="ltr"
                  className={field}
                  value={invoiceNo}
                  disabled={posted}
                  required
                  onChange={(e) => setInvoiceNo(e.target.value)}
                />
              </label>
              <label className={label}>
                {t("date")}
                <input
                  dir="ltr"
                  type="date"
                  className={field}
                  value={date}
                  disabled={posted}
                  required
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className={label}>
                {t("terms")}
                <select
                  className={`${field} box-content appearance-none`}
                  value={terms}
                  disabled={posted}
                  onChange={(e) => setTerms(Number(e.target.value))}
                >
                  {TERMS.map((d) => (
                    <option key={d} value={d}>
                      {d === 0 ? t("cash") : t("credit", { days: d })}
                    </option>
                  ))}
                </select>
              </label>
              {!posted && (
                <button
                  type="submit"
                  disabled={busy}
                  className="h-[48px] cursor-pointer rounded-[10px] border-0 bg-primary text-[16px] font-semibold text-primary-ink disabled:cursor-progress"
                >
                  {t("saveHeader")}
                </button>
              )}
              <div className="text-[12px] text-muted" />
            </form>
          </Panel>
        </section>
        <section className="col-span-8 min-w-0 max-[1180px]:col-span-12">
          <Panel
            title={t("lines")}
            note={
              !posted && (
                <Button
                  variant="quiet"
                  className="h-[28px] px-[8px] text-[13px]"
                  onClick={() => setEditing({ index: null })}
                >
                  {t("addLine")}
                </Button>
              )
            }
          >
            <div role="table" aria-label={t("lines")}>
              <TableHead columns={columns} />
              {lines.map((l, i) => (
                <TableRow
                  key={i}
                  columns={columns}
                  onActivate={posted ? undefined : () => setEditing({ index: i })}
                >
                  <TextCell>{ar ? l.item_name_ar : l.item_name_en}</TextCell>
                  <TextCell>{ar ? l.unit_name_ar : l.unit_name_en}</TextCell>
                  <NumberCell>{amount(l.quantity)}</NumberCell>
                  <NumberCell>{amount(l.bonus_quantity)}</NumberCell>
                  <NumberCell>{amount(l.unit_cost)}</NumberCell>
                  <CodeCell>{l.batch_no}</CodeCell>
                  <CodeCell>{l.expiry_date ?? DASH}</CodeCell>
                  <span role="cell" className="justify-self-start">
                    <Badge tone={l.expiry_date ? "success" : "warn"} dense>
                      {l.expiry_date ? t("sellable") : t("held")}
                    </Badge>
                  </span>
                </TableRow>
              ))}
              {lines.length === 0 && <TableEmpty>{t("noLines")}</TableEmpty>}
            </div>
          </Panel>
        </section>
        <section className="col-span-12 min-w-0">
          <div className="grid grid-cols-3 gap-[16px] max-[760px]:grid-cols-1">
            <StatTile label={t("total")} value={money(receipt?.total ?? 0, locale)} note="" />
            <StatTile
              label={t("bonus")}
              value={money(receipt?.bonus_allocated ?? 0, locale)}
              note=""
            />
            <StatTile label={t("heldLines")} value={String(held)} note={t("notSellable")} />
          </div>
        </section>
      </div>
      <LineDialog
        open={editing !== null}
        line={editing?.index !== null && editing ? (lines[editing.index] ?? null) : null}
        onClose={() => setEditing(null)}
        onSave={(l) => void saveLine(l)}
        onRemove={editing?.index !== null && editing ? () => void removeLine() : undefined}
      />
      <SupplierDialog
        open={newSupplier}
        onClose={() => setNewSupplier(false)}
        onCreated={(s) => {
          setSuppliers((all) => [...all, s]);
          setSupplierId(s.id);
          setTerms(s.payment_terms_days ?? 0);
          setNewSupplier(false);
        }}
      />
      <ConfirmDialog
        open={confirm}
        title={t("confirmTitle")}
        body={t("confirmBody")}
        impact={[
          { label: t("supplierBalance"), value: `+${money(receipt?.total ?? 0, locale)}` },
          { label: t("heldLines"), value: String(held) },
        ]}
        cancelLabel={t("back")}
        confirmLabel={t("approve")}
        busyLabel={t("approving")}
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void approve()}
      />
    </>
  );
}
