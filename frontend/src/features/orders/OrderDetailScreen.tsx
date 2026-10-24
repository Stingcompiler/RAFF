"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { Segmented } from "@/components/ui/Segmented";
import { NumberCell, TableHead, TableRow, TextCell, type Column } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/api/browser";
import { cn } from "@/lib/cn";
import { amount, money, timeOfDay } from "@/lib/format";

import { type OrderDetail, type OrderStatus, STATUS_TONE } from "./labels";

type Template = "confirm" | "contact" | "ready";
const DASH = "—";
const MINUS = "−";
const PLUS = "+";
const NEEDS_REASON: OrderStatus[] = ["needs_contact", "cancelled"];
const ERRORS = [
  "transition_not_allowed",
  "reason_required",
  "consent_required",
  "not_editable",
] as const;

/** Order details (§5.2): allowed transitions only, edits with recorded consent, WhatsApp templates. */
export function OrderDetailScreen({
  initial,
  storeName,
}: {
  initial: OrderDetail;
  storeName: string;
}) {
  const t = useTranslations("orders");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const [order, setOrder] = useState(initial);
  const [moving, setMoving] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [consent, setConsent] = useState("");
  const [note, setNote] = useState(initial.internal_note);
  const [tpl, setTpl] = useState<Template>(
    initial.status === "ready"
      ? "ready"
      : initial.status === "needs_contact"
        ? "contact"
        : "confirm",
  );

  const fail = (error: Record<string, unknown> | null) => {
    const code = typeof error?.detail === "string" ? error.detail : "";
    toast.push(
      "danger",
      (ERRORS as readonly string[]).includes(code)
        ? t(`errors.${code as (typeof ERRORS)[number]}`)
        : t("errors.failed"),
    );
  };

  const move = async (e: FormEvent) => {
    e.preventDefault();
    if (!moving) return;
    setBusy(true);
    const res = await apiSend<OrderDetail>("POST", `/orders/${order.id}/transition/`, {
      to: moving,
      reason,
    });
    setBusy(false);
    if (!res.ok) return fail(res.error);
    setOrder(res.data);
    setMoving(null);
    setReason("");
    toast.push("success", t("saved"));
  };

  const saveEdit = async () => {
    setBusy(true);
    const res = await apiSend<OrderDetail>("PATCH", `/orders/${order.id}/lines/`, {
      quantities,
      consent,
    });
    setBusy(false);
    if (!res.ok) return fail(res.error);
    setOrder(res.data);
    setEditing(false);
    setQuantities({});
    setConsent("");
    toast.push("success", t("saved"));
  };

  const saveNote = async () => {
    const res = await apiSend<OrderDetail>("PATCH", `/orders/${order.id}/note/`, {
      internal_note: note,
    });
    if (!res.ok) return fail(res.error);
    setOrder(res.data);
    toast.push("success", t("saved"));
  };

  const editable = order.status === "new" || order.status === "needs_contact";
  const total = money(order.estimated_total, ar ? "ar" : "en") || money("0", ar ? "ar" : "en");
  const waText = t(`waTpl.${tpl}`, {
    name: order.customer_name,
    number: order.number,
    store: storeName,
    total,
    reason: order.reason || DASH,
  });
  const waHref = `https://wa.me/${order.phone.replace(/^0/, "249")}?text=${encodeURIComponent(waText)}`;
  const columns: Column[] = [
    { header: t("hItem"), width: "minmax(0,1fr)" },
    { header: t("pub"), width: "110px", numeric: true },
    { header: t("cur"), width: "110px", numeric: true },
    { header: t("avail"), width: "90px", numeric: true },
    { header: t("qty"), width: "120px", numeric: true },
  ];

  return (
    <div className="grid gap-[14px]">
      <div className="flex flex-wrap items-center gap-[12px]">
        <Link
          href="/orders"
          className="inline-flex min-h-[44px] items-center whitespace-nowrap text-brand"
        >
          {t("back")}
        </Link>
        <h1 dir="ltr" className="m-0 type-page num">
          {order.number}
        </h1>
        <Badge tone={STATUS_TONE[order.status]} dense>
          {t(`status.${order.status}`)}
        </Badge>
        <span className="whitespace-nowrap text-text-muted">
          {order.customer_name}{" "}
          <bdi dir="ltr" className="num">
            {order.phone}
          </bdi>
        </span>
        <span className="ms-auto flex flex-wrap gap-[8px]">
          {order.status === "ready" && !order.sale_number && (
            <Link href={`/pos?order=${order.id}`} className={cn(buttonClasses({}), "no-underline")}>
              {t("toPos")}
            </Link>
          )}
          {editable && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              {t("edit")}
            </Button>
          )}
          {order.allowed.map((to) => (
            <Button
              key={to}
              variant={
                to === "cancelled" ? "outline" : to === "needs_contact" ? "outline" : "primary"
              }
              onClick={() => setMoving(to)}
            >
              {t(`to.${to as "needs_contact" | "confirmed" | "preparing" | "ready" | "cancelled"}`)}
            </Button>
          ))}
        </span>
      </div>
      {order.sale_number && (
        <div className="rounded-control bg-success-bg px-[14px] py-[10px] font-medium text-success-text">
          {[t("linked"), order.sale_number].join(" ")}
        </div>
      )}
      {order.status === "ready" && !order.sale_number && (
        <div className="rounded-control bg-info-bg px-[14px] py-[10px] font-medium text-info-text">
          {t("readyNote")}
        </div>
      )}
      {(order.status === "cancelled" || order.status === "needs_contact") && order.reason && (
        <div
          className={
            order.status === "cancelled"
              ? "rounded-control bg-danger-bg px-[14px] py-[10px] font-medium text-danger-text"
              : "rounded-control bg-warning-bg px-[14px] py-[10px] font-medium text-warning-text"
          }
        >
          {order.reason}
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] items-start gap-[16px] max-[1180px]:grid-cols-1">
        <div className="grid gap-[12px]">
          <Panel>
            <div role="table" aria-label={order.number}>
              <TableHead columns={columns} />
              {order.lines.map((l) => {
                const qty = quantities[l.id] ?? l.quantity;
                return (
                  <TableRow key={l.id} columns={columns}>
                    <TextCell>
                      {[ar ? l.name_ar : l.name_en, l.strength].filter(Boolean).join(" ")}
                      {l.rx && (
                        <span className="ms-[6px] text-caption text-info-text">{t("rxNote")}</span>
                      )}
                    </TextCell>
                    <NumberCell>{l.published_price ? amount(l.published_price) : DASH}</NumberCell>
                    <NumberCell>{l.current_price ? amount(l.current_price) : DASH}</NumberCell>
                    <NumberCell>{l.available_units}</NumberCell>
                    <span role="cell" className="flex justify-end">
                      {editing ? (
                        <span className="flex items-center overflow-hidden rounded-control border border-border">
                          <button
                            type="button"
                            aria-label={MINUS}
                            onClick={() =>
                              setQuantities((p) => ({ ...p, [l.id]: Math.max(0, qty - 1) }))
                            }
                            className="type-inherit grid h-[36px] w-[32px] cursor-pointer place-items-center border-0 bg-surface-subtle text-text"
                          >
                            {MINUS}
                          </button>
                          <span dir="ltr" className="w-[32px] text-center font-semibold num">
                            {qty}
                          </span>
                          <button
                            type="button"
                            aria-label={PLUS}
                            onClick={() =>
                              setQuantities((p) => ({ ...p, [l.id]: Math.min(20, qty + 1) }))
                            }
                            className="type-inherit grid h-[36px] w-[32px] cursor-pointer place-items-center border-0 bg-surface-subtle text-text"
                          >
                            {PLUS}
                          </button>
                        </span>
                      ) : (
                        <span className=" num">{qty}</span>
                      )}
                    </span>
                  </TableRow>
                );
              })}
            </div>
            <div className="flex min-h-[48px] items-center justify-between border-t border-border px-[16px] font-semibold">
              <span>{t("finalT")}</span>
              <span dir="ltr" className="num">
                {total}
              </span>
            </div>
          </Panel>
          {editing && (
            <Panel title={t("editTitle")}>
              <div className="grid gap-[8px] p-[14px]">
                <label className="grid gap-[4px] type-label text-text-secondary">
                  {t("consentL")}
                  <Textarea
                    rows={2}
                    value={consent}
                    placeholder={t("consentPh")}
                    onChange={(e) => setConsent(e.target.value)}
                  />
                </label>
                <div className="flex gap-[8px]">
                  <Button onClick={() => void saveEdit()} disabled={busy || !consent.trim()}>
                    {t("editSave")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(false);
                      setQuantities({});
                    }}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            </Panel>
          )}
          {order.note && (
            <Panel title={t("customerNote")}>
              <p className="m-0 p-[14px]">{order.note}</p>
            </Panel>
          )}
        </div>
        <div className="grid gap-[12px]">
          <Panel title={t("waT")}>
            <div className="grid gap-[10px] p-[14px]">
              <Segmented<Template>
                label={t("waT")}
                value={tpl}
                onChange={setTpl}
                items={[
                  { id: "confirm", label: t("tpl.confirm") },
                  { id: "contact", label: t("tpl.contact") },
                  { id: "ready", label: t("tpl.ready") },
                ]}
              />
              <div
                data-testid="wa-text"
                className="rounded-control border border-border bg-canvas px-[12px] py-[10px] text-label leading-loose whitespace-pre-line"
              >
                {waText}
              </div>
              <div className="flex gap-[8px]">
                <a
                  href={waHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[44px] items-center rounded-control bg-brand px-[14px] font-semibold text-on-brand no-underline"
                >
                  {t("openWa")}
                </a>
                <Button
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(waText)
                      .then(() => toast.push("success", t("copied")))
                  }
                >
                  {t("copy")}
                </Button>
              </div>
            </div>
          </Panel>
          <Panel title={t("timeline")}>
            <ol className="m-0 grid list-none gap-[10px] p-[14px]">
              {order.events.map((e, i) => (
                <li key={i} className="grid gap-[2px]">
                  <span className="flex flex-wrap items-baseline gap-[8px]">
                    <Badge tone={STATUS_TONE[e.status]} dense>
                      {t(`status.${e.status}`)}
                    </Badge>
                    <span className="text-label">
                      {(ar ? e.actor_ar : e.actor_en) ?? t("customer")}
                    </span>
                    <bdi dir="ltr" className="text-caption text-text-muted num">
                      {[e.at.slice(0, 10), timeOfDay(e.at)].join(" ")}
                    </bdi>
                  </span>
                  {e.note && <span className="text-label text-text-muted">{e.note}</span>}
                </li>
              ))}
            </ol>
          </Panel>
          <div className="grid gap-[8px] rounded-card border border-dashed border-warning-solid bg-warning-bg p-[14px]">
            <div className="font-medium text-warning-text">{t("internal")}</div>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label={t("internal")}
            />
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() => void saveNote()}
            >
              {t("internalSave")}
            </Button>
          </div>
        </div>
      </div>
      <Dialog
        open={moving !== null}
        onClose={busy ? undefined : () => setMoving(null)}
        labelledBy="move-title"
      >
        <form onSubmit={move} className="grid gap-[14px]">
          <div id="move-title" className="text-lead font-medium">
            {moving
              ? t("transitionTitle", {
                  to: t(
                    `to.${moving as "needs_contact" | "confirmed" | "preparing" | "ready" | "cancelled"}`,
                  ),
                  number: order.number,
                })
              : ""}
          </div>
          <div className="text-text-muted">{t("transitionBody")}</div>
          {moving && NEEDS_REASON.includes(moving) && (
            <label className="grid gap-[4px] type-label text-text-secondary">
              {t("reasonL")}
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          )}
          <div className="flex justify-end gap-[8px]">
            <Button variant="outline" size="lg" onClick={() => setMoving(null)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={
                busy || (moving !== null && NEEDS_REASON.includes(moving) && !reason.trim())
              }
            >
              {busy ? t("saving") : t("confirm")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
