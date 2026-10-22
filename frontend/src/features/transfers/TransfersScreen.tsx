"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
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
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { money } from "@/lib/format";

import { NewTransferDialog } from "./NewTransferDialog";

type Transfer = Schemas["Transfer"];
type Detail = Schemas["TransferDetail"];
const TONE: Record<string, Tone> = {
  draft: "info",
  sent: "info",
  partial: "warn",
  closed: "success",
};
const STATUSES = ["draft", "sent", "partial", "closed"] as const;
const DASH = "—";

type Props = {
  initial: Transfer[];
  branchId: string;
  branches: Schemas["Branch"][];
};

const units = (base: number, factor: number) =>
  base % (factor || 1) === 0
    ? String(base / (factor || 1))
    : `${Math.floor(base / factor)} +${base % factor}`;

/** Branch transfers (Raff Screens › التحويلات بين الفروع). */
export function TransfersScreen({ initial, branchId, branches }: Props) {
  const t = useTranslations("transfers");
  const tErr = useTranslations("transfers.errors");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const [list, setList] = useState(initial);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<"send" | "receive" | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  const status = (s: string) =>
    t(
      `status.${(STATUSES as readonly string[]).includes(s) ? (s as (typeof STATUSES)[number]) : "draft"}`,
    );
  const name = (b: { name_ar: string; name_en: string }) => (ar ? b.name_ar : b.name_en);
  const open = async (id: string) => {
    const res = await apiGet<Detail>(`/transfers/${id}/`);
    if (res.ok) {
      setDetail(res.data);
      setReceived({});
      setKey(null);
    }
  };
  const refresh = async (id?: string) => {
    const res = await apiGet<Transfer[]>("/transfers/");
    if (res.ok) setList(res.data);
    if (id) void open(id);
  };
  const errorText = (error: Record<string, unknown> | null) => {
    const code = typeof error?.detail === "string" ? error.detail : "failed";
    const known = [
      "insufficient_stock",
      "same_branch",
      "not_a_draft",
      "not_sent",
      "invalid_received",
    ] as const;
    return (known as readonly string[]).includes(code)
      ? tErr(code as (typeof known)[number])
      : tErr("failed");
  };

  const act = async () => {
    if (!detail || !confirm) return;
    const k = key ?? crypto.randomUUID();
    setKey(k);
    setBusy(true);
    const res =
      confirm === "send"
        ? await apiSend<Detail>("POST", `/transfers/${detail.id}/send/`, undefined, {
            idempotencyKey: k,
          })
        : await apiSend<Detail>(
            "POST",
            `/transfers/${detail.id}/receive/`,
            {
              lines: detail.lines
                .filter((li) => received[li.id] !== undefined)
                .map((li) => ({ line_id: li.id, received: Number(received[li.id]) })),
            },
            { idempotencyKey: k },
          );
    setBusy(false);
    const done = confirm;
    setConfirm(null);
    if (!res.ok) {
      if (res.status !== 0) setKey(null);
      return toast.push("danger", errorText(res.error));
    }
    toast.push("success", done === "send" ? t("sent") : t("received"));
    setKey(null);
    void refresh(detail.id);
  };

  const listCols: Column[] = [
    { header: t("colNumber"), width: "80px" },
    { header: t("colRoute"), width: "1fr" },
    { header: t("colLines"), width: "60px", numeric: true },
    { header: t("colStatus"), width: "150px" },
  ];
  const lineCols: Column[] = [
    { header: t("colItem"), width: "minmax(0,1fr)" },
    { header: t("colBatch"), width: "80px" },
    { header: t("colSent"), width: "60px", numeric: true },
    { header: t("colReceived"), width: "80px", numeric: true },
    { header: t("colDiff"), width: "100px" },
  ];
  const canSend = detail?.status === "draft" && detail.from_branch.id === branchId;
  const canReceive = detail?.status === "sent" && detail.to_branch.id === branchId;
  const title = detail
    ? canReceive
      ? t("receiveTitle", { number: detail.number })
      : t("detail", { number: detail.number || t("draftNo") })
    : t("pick");

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <>
            <Button variant={canSend ? "outline" : "primary"} onClick={() => setCreating(true)}>
              {t("new")}
            </Button>
            {canSend && detail && (
              <Button onClick={() => setConfirm("send")}>
                {t("send", { number: detail.number || t("draftNo") })}
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-12 items-start gap-[16px]">
        <section className="col-span-5 min-w-0 max-[1180px]:col-span-12">
          <Panel title={t("list")}>
            <div role="table" aria-label={t("list")}>
              <TableHead columns={listCols} />
              {list.map((tr) => (
                <TableRow
                  key={tr.id}
                  columns={listCols}
                  selected={detail?.id === tr.id}
                  onActivate={() => void open(tr.id)}
                >
                  <CodeCell>{tr.number || DASH}</CodeCell>
                  <TextCell>
                    {t("route", { from: name(tr.from_branch), to: name(tr.to_branch) })}
                  </TextCell>
                  <NumberCell>{tr.lines_count}</NumberCell>
                  <BadgeCell tone={TONE[tr.status] ?? "info"}>{status(tr.status)}</BadgeCell>
                </TableRow>
              ))}
              {list.length === 0 && <TableEmpty>{t("none")}</TableEmpty>}
            </div>
          </Panel>
        </section>
        <section className="col-span-7 min-w-0 max-[1180px]:col-span-12">
          <Panel title={title} note={detail ? money(detail.value, ar ? "ar" : "en") : undefined}>
            {detail && (
              <div role="table" aria-label={title}>
                <TableHead columns={lineCols} />
                {detail.lines.map((li) => {
                  // Display only; the server converts and records what was received.
                  const got =
                    received[li.id] !== undefined
                      ? Number(received[li.id]) * li.factor
                      : (li.received_base ?? li.quantity_base);
                  const diff = got - li.quantity_base;
                  return (
                    <TableRow key={li.id} columns={lineCols}>
                      <TextCell>
                        {ar ? li.name_ar : li.name_en}{" "}
                        <bdi dir="ltr" className="text-[12px] text-muted">
                          {li.strength}
                        </bdi>
                      </TextCell>
                      <CodeCell>{li.batch_no}</CodeCell>
                      <NumberCell>{units(li.quantity_base, li.factor)}</NumberCell>
                      <span role="cell">
                        {canReceive ? (
                          <input
                            dir="ltr"
                            type="number"
                            min={0}
                            aria-label={[t("colReceived"), ar ? li.name_ar : li.name_en].join(
                              " — ",
                            )}
                            value={received[li.id] ?? String(li.quantity_base / li.factor)}
                            onChange={(e) =>
                              setReceived((prev) => ({ ...prev, [li.id]: e.target.value }))
                            }
                            className="h-[32px] w-full rounded-[6px] border border-line bg-surface px-[6px] text-end text-ink tabular-nums"
                          />
                        ) : (
                          <span className="block text-end tabular-nums">
                            {li.received_base === null ? DASH : units(li.received_base, li.factor)}
                          </span>
                        )}
                      </span>
                      <span role="cell">
                        {detail.status === "draft" ? null : diff === 0 ? (
                          <Badge tone="success" dense>
                            {t("match")}
                          </Badge>
                        ) : (
                          <Badge tone="warn" dense>
                            {units(diff, li.factor)}
                          </Badge>
                        )}
                      </span>
                    </TableRow>
                  );
                })}
              </div>
            )}
            {canReceive && (
              <div className="flex justify-end p-[12px]">
                <Button onClick={() => setConfirm("receive")}>{t("receive")}</Button>
              </div>
            )}
          </Panel>
        </section>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "send" ? t("sendTitle") : t("receive")}
        body={confirm === "send" ? t("sendBody") : t("receiveBody")}
        impact={
          detail
            ? [
                { label: t("lines"), value: String(detail.lines.length) },
                { label: t("value"), value: money(detail.value, ar ? "ar" : "en") },
              ]
            : []
        }
        cancelLabel={t("cancel")}
        confirmLabel={
          confirm === "send" ? t("send", { number: detail?.number || t("draftNo") }) : t("receive")
        }
        busyLabel={confirm === "send" ? t("sending") : t("receiving")}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void act()}
      />
      {creating && (
        <NewTransferDialog
          branches={branches.filter((b) => b.id !== branchId)}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            toast.push("success", t("saved"));
            void refresh(id);
          }}
        />
      )}
    </>
  );
}
