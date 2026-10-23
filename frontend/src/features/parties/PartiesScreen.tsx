"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select, TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { Segmented } from "@/components/ui/Segmented";
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
import { apiGet, apiSend } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { cleanAmount, subtract } from "@/lib/decimal";
import { amount, money } from "@/lib/format";

type Party = Schemas["Party"];
type Row = Schemas["LedgerRow"];
type Kind = "customer" | "supplier";
const DOCS = ["sale", "return", "receipt", "party_payment", "quarantine"] as const;
const DASH = "—";

type Props = { customers: Party[]; suppliers: Party[]; canPay: boolean };

/** Customers & suppliers (Raff Screens › العملاء والموردون). */
export function PartiesScreen({ customers: c0, suppliers: s0, canPay }: Props) {
  const t = useTranslations("parties");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const cur = (v: string) => money(v, ar ? "ar" : "en") || money("0", ar ? "ar" : "en");
  const [kind, setKind] = useState<Kind>("customer");
  const [lists, setLists] = useState({ customer: c0, supplier: s0 });
  const [chosen, setChosen] = useState<Party | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [paying, setPaying] = useState(false);

  const parties = lists[kind];
  const open = async (party: Party, k: Kind = kind) => {
    setChosen(party);
    const res = await apiGet<Row[]>(`/finance/ledger/?type=${k}&party=${party.id}`);
    setRows(res.ok ? res.data : []);
  };
  const refresh = async () => {
    const res = await apiGet<Party[]>(`/finance/parties/?type=${kind}`);
    if (!res.ok) return;
    setLists((prev) => ({ ...prev, [kind]: res.data }));
    const again = chosen && res.data.find((p) => p.id === chosen.id);
    if (again) void open(again);
  };
  const describe = (row: Row) => {
    const doc = (DOCS as readonly string[]).includes(row.document_type)
      ? (row.document_type as (typeof DOCS)[number])
      : "other";
    return doc === "other" ? t("doc.other") : t(`doc.${doc}`, { number: row.document_number });
  };

  const partyCols: Column[] = [
    { header: t("colName"), width: "1fr" },
    { header: t("colPhone"), width: "110px" },
    { header: t("colBalance"), width: "110px", numeric: true },
    { header: t("colLast"), width: "95px" },
  ];
  const ledgerCols: Column[] = [
    { header: t("colDate"), width: "90px" },
    { header: t("colDescription"), width: "1fr" },
    { header: t("colDebit"), width: "90px", numeric: true },
    { header: t("colCredit"), width: "90px", numeric: true },
  ];
  const name = (p: Party) => (ar ? p.name_ar : p.name_en);
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={canPay && <Button onClick={() => setPaying(true)}>{t("record")}</Button>}
      />
      <div className="grid grid-cols-12 items-start gap-[16px]">
        <section className="col-span-6 min-w-0 max-[1180px]:col-span-12">
          <Panel
            title={kind === "customer" ? t("customers") : t("suppliers")}
            chips={
              <Segmented<Kind>
                className="ms-auto"
                label={t("title")}
                value={kind}
                items={[
                  { id: "customer", label: t("customers") },
                  { id: "supplier", label: t("suppliers") },
                ]}
                onChange={(v) => {
                  setKind(v);
                  setChosen(null);
                  setRows([]);
                }}
              />
            }
          >
            <div role="table" aria-label={kind === "customer" ? t("customers") : t("suppliers")}>
              <TableHead columns={partyCols} />
              {parties.map((p) => (
                <TableRow
                  key={p.id}
                  columns={partyCols}
                  selected={chosen?.id === p.id}
                  onActivate={() => void open(p)}
                >
                  <TextCell>{name(p)}</TextCell>
                  <CodeCell>{p.phone || DASH}</CodeCell>
                  <NumberCell>{cur(p.balance)}</NumberCell>
                  <CodeCell>{p.last_activity ? p.last_activity.slice(0, 10) : DASH}</CodeCell>
                </TableRow>
              ))}
              {parties.length === 0 && <TableEmpty>{DASH}</TableEmpty>}
            </div>
          </Panel>
        </section>
        <section className="col-span-6 min-w-0 max-[1180px]:col-span-12">
          <Panel title={chosen ? t("ledger", { name: name(chosen) }) : t("pickParty")}>
            <div
              role="table"
              aria-label={chosen ? t("ledger", { name: name(chosen) }) : t("pickParty")}
            >
              <TableHead columns={ledgerCols} />
              {rows.map((r) => (
                <TableRow key={r.id} columns={ledgerCols}>
                  <CodeCell>{r.date.slice(0, 10)}</CodeCell>
                  <TextCell>{describe(r)}</TextCell>
                  <NumberCell>{r.debit ? amount(r.debit) : ""}</NumberCell>
                  <NumberCell>{r.credit ? amount(r.credit) : ""}</NumberCell>
                </TableRow>
              ))}
              {chosen && rows.length === 0 && <TableEmpty>{t("noEntries")}</TableEmpty>}
            </div>
          </Panel>
        </section>
      </div>
      {paying && (
        <PaymentDialog
          kind={kind}
          parties={parties}
          initial={chosen}
          onClose={() => setPaying(false)}
          onDone={(number) => {
            setPaying(false);
            toast.push("success", t("saved", { number }));
            void refresh();
          }}
        />
      )}
    </>
  );
}

type DialogProps = {
  kind: Kind;
  parties: Party[];
  initial: Party | null;
  onClose: () => void;
  onDone: (number: string) => void;
};

function PaymentDialog({ kind, parties, initial, onClose, onDone }: DialogProps) {
  const t = useTranslations("parties");
  const ar = useLocale() === "ar";
  const [partyId, setPartyId] = useState(initial?.id ?? parties[0]?.id ?? "");
  const [method, setMethod] = useState<"cash" | "bank">("cash");
  const [value, setValue] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const party = parties.find((p) => p.id === partyId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!party || !value) return;
    setBusy(true);
    const res = await apiSend<{ number: string }>(
      "POST",
      "/finance/payments/",
      { party_type: kind, party_id: party.id, method, amount: value, reference },
      { idempotencyKey: key },
    );
    setBusy(false);
    if (res.ok) return onDone(res.data.number);
    const code = typeof res.error?.detail === "string" ? res.error.detail : "failed";
    setError(
      code === "bank_reference_required" || code === "invalid_amount"
        ? t(`errors.${code}`)
        : t("errors.failed"),
    );
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} labelledBy="pay-title">
      <form onSubmit={submit} className="grid gap-[14px]">
        <div id="pay-title" className="text-[16px] font-medium">
          {t("payTitle")}
        </div>
        <div className="text-text-muted">
          {kind === "customer" ? t("payBodyCustomer") : t("payBodySupplier")}
        </div>
        <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
          {t("party")}
          <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {ar ? p.name_ar : p.name_en}
              </option>
            ))}
          </Select>
        </label>
        <div className="grid grid-cols-2 gap-[12px]">
          <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
            {t("method")}
            <Select value={method} onChange={(e) => setMethod(e.target.value as "cash" | "bank")}>
              <option value="cash">{t("cash")}</option>
              <option value="bank">{t("bankMethod")}</option>
            </Select>
          </label>
          <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
            {t("amount")}
            <TextInput
              dir="ltr"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(cleanAmount(e.target.value))}
            />
          </label>
        </div>
        {method === "bank" && (
          <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
            {t("reference")}
            <TextInput dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        )}
        {party && value && (
          <div className="flex justify-between gap-[12px] rounded-control bg-warning-bg p-[12px] font-medium text-warning-text">
            <span>{t("newBalance")}</span>
            <span dir="ltr" className="tabular-nums">
              {money(subtract(party.balance, value), ar ? "ar" : "en")}
            </span>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-control bg-danger-bg px-[12px] py-[8px] text-danger-text"
          >
            {error}
          </div>
        )}
        <div className="flex justify-end gap-[8px]">
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="submit" size="lg" disabled={busy || !value || !party}>
            {busy ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
