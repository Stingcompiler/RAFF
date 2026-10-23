"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { AvailabilityBadge } from "@/components/storefront/AvailabilityBadge";
import { OrderStatusStepper } from "@/components/storefront/OrderStatusStepper";
import { OrderTimeline } from "@/components/storefront/OrderTimeline";
import { PickupSelector } from "@/components/storefront/PickupSelector";
import { PriceWithDate } from "@/components/storefront/PriceWithDate";
import { ProductCard, storeButton } from "@/components/storefront/ProductCard";
import { PublishToggle } from "@/components/storefront/PublishToggle";
import { RxNotice } from "@/components/storefront/RxNotice";
import { StorefrontStatusChip } from "@/components/storefront/StorefrontStatusChip";
import { WhatsAppAction } from "@/components/storefront/WhatsAppAction";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { ConnectionIndicator } from "@/components/ui/ConnectionIndicator";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchIcon } from "@/components/ui/icons";
import { KeyboardHint } from "@/components/ui/KeyboardHint";
import { ReceiptPreview, type ReceiptData } from "@/components/ui/ReceiptPreview";
import { SearchField } from "@/components/ui/SearchField";
import { Segmented } from "@/components/ui/Segmented";
import { StatusDot } from "@/components/ui/StatusDot";
import {
  TableEmpty,
  TableHead,
  TableRow,
  TableSkeletonRow,
  type Column,
} from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { Toast, type ToastTone } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

// Technical identifiers shown as-is in both locales (component and state names).
const VARIANTS: readonly ButtonVariant[] = ["primary", "outline", "quiet", "danger"];
const STATES = ["default", "hover", "focus", "disabled", "loading"] as const;
const CAPTION = {
  button: "Button",
  inputs: "Input · Select · Textarea · SearchField",
  status: "Badge · StatusDot · KeyboardHint · ConnectionIndicator",
  table: "Table · Tabs · Segmented",
  dialog: "Dialog · Toast · EmptyState",
  iconButton: "IconButton · ",
  receipt: "Receipt preview · 80mm · ",
  cards: "ProductCard · ",
  availability: "AvailabilityBadge · RxNotice · PriceWithDate",
  pickup: "PickupSelector",
  chip: "StorefrontStatusChip",
  stepper: "OrderStatusStepper · ",
  timeline: "OrderTimeline · ",
  publish: "PublishToggle",
  whatsapp: "WhatsAppAction",
  amount: "−1,512,000",
  qty12: "12",
  qty120: "120",
  plus: "+",
} as const;
const caption = "text-[12px] font-semibold uppercase tracking-[.04em] text-text-muted";
const tableCols: readonly Column[] = [
  { header: "", width: "36px" },
  { header: "", width: "1fr" },
  { header: "", width: "70px", numeric: true },
  { header: "", width: "90px" },
];

function ThemeSection({ theme }: { theme: "light" | "dark" }) {
  const t = useTranslations("dev.gallery");
  const [tab, setTab] = useState<"details" | "batches" | "movements">("details");
  const [seg, setSeg] = useState<"week" | "month">("week");
  const [selected, setSelected] = useState<number[]>([1]);
  const [toasts, setToasts] = useState<{ id: number; tone: ToastTone }[]>([]);

  const addToast = (tone: ToastTone) => {
    const id = Date.now();
    setToasts((all) => [...all, { id, tone }].slice(-3));
    setTimeout(
      () => setToasts((all) => all.filter((x) => x.id !== id)),
      tone === "danger" ? 8000 : 3500,
    );
  };
  const toastMessage = {
    success: t("toastOkMsg"),
    warn: t("toastWarnMsg"),
    danger: t("toastErrMsg"),
  };

  const inputBox =
    "flex h-[44px] items-center rounded-control bg-canvas px-[12px] text-[14px] font-normal text-text";
  const rows: [string, string, Tone, string][] = [
    [t("r1"), "210", "success", t("rGood")],
    [t("r2"), "18", "warn", t("rLow")],
    [t("r3"), "7", "danger", t("rExpired")],
  ];
  const head: readonly Column[] = [
    { header: "", width: "36px" },
    { header: `${t("item")} ↑`, width: "1fr" },
    { header: t("qty"), width: "70px", numeric: true },
    { header: t("status"), width: "90px" },
  ];

  return (
    <section
      data-theme={theme}
      className="grid min-w-0 content-start gap-[24px] rounded-card border border-border bg-canvas p-[24px] text-text"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-[16px] font-medium">
          {theme === "light" ? t("themeLight") : t("themeDark")}
        </h2>
        <span className="text-[12px] text-text-muted">{t("hint")}</span>
      </div>

      <div className="grid gap-[12px]">
        <div className={caption}>{CAPTION.button}</div>
        <div className="grid grid-cols-[70px_repeat(5,minmax(0,1fr))] items-center gap-[8px] text-[12px] text-text-muted">
          <span />
          {STATES.map((s) => (
            <span key={s}>{s}</span>
          ))}
          {VARIANTS.map((v) => (
            <div key={v} className="contents">
              <span className="font-medium text-text">{v}</span>
              {STATES.map((s) => (
                <Button
                  key={s}
                  variant={v}
                  forceState={s === "hover" || s === "focus" ? s : undefined}
                  disabled={s === "disabled"}
                  loading={s === "loading"}
                  className="min-w-0 px-[8px] text-[13px] font-semibold"
                >
                  {s === "loading" ? t("saving") : t("btn")}
                </Button>
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-[8px]">
          <span
            aria-label={t("search")}
            className="grid size-[44px] place-items-center rounded-control border border-border bg-surface"
          >
            <SearchIcon />
          </span>
          <span className="text-[12px] text-text-muted">
            {CAPTION.iconButton}
            {t("iconNote")}
          </span>
        </div>
      </div>

      <div className="grid gap-[12px]">
        <div className={caption}>{CAPTION.inputs}</div>
        <div className="grid grid-cols-2 gap-[12px]">
          <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
            {t("name")}
            <span className={cn(inputBox, "border border-border")}>{t("nameV")}</span>
            <span className="font-normal text-text-muted">{t("helper")}</span>
          </label>
          <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
            {t("qtyFocus")}
            <span
              className={cn(
                inputBox,
                "border-2 border-brand shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-focus)]",
              )}
            >
              {CAPTION.qty12}
            </span>
            <span />
          </label>
          <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
            {t("qtyError")}
            <span className={cn(inputBox, "border-2 border-danger-solid")}>{CAPTION.qty120}</span>
            <span className="text-danger-text">{t("qtyErrorMsg")}</span>
          </label>
          <label className="grid gap-[4px] text-[12px] font-medium text-text-muted">
            {t("disabled")}
            <span
              className={cn(inputBox, "border border-border bg-surface-subtle text-text-muted")}
            >
              {t("batchNo")}
            </span>
            <span />
          </label>
        </div>
        <SearchField label={t("search")} placeholder={t("ph")} shortcut="F2" readOnly />
      </div>

      <div className="grid gap-[12px]">
        <div className={caption}>{CAPTION.status}</div>
        <div className="flex flex-wrap gap-[8px]">
          <Badge tone="success">{t("bValid")}</Badge>
          <Badge tone="warn">{t("bNear")}</Badge>
          <Badge tone="warn">{t("bShort")}</Badge>
          <Badge tone="danger">{t("bExpired")}</Badge>
          <Badge tone="danger">{t("bQuar")}</Badge>
          <Badge tone="info">{t("bTransit")}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-[16px] text-[13px]">
          {(
            [
              ["success", t("dOnline")],
              ["warn", t("dPending")],
              ["danger", t("dError")],
            ] as const
          ).map(([tone, label]) => (
            <span key={tone} className="flex items-center gap-[6px]">
              <StatusDot tone={tone} />
              {label}
            </span>
          ))}
          <span className="flex gap-[6px]">
            <KeyboardHint value="F8" />
            <KeyboardHint value="Ctrl" />
            {CAPTION.plus}
            <KeyboardHint value="K" />
          </span>
        </div>
        <div className="grid gap-[8px]">
          <ConnectionIndicator
            variant="bar"
            status="online"
            label={t("cOnline")}
            detail={t("cOnlineD")}
          />
          <ConnectionIndicator
            variant="bar"
            status="reconnecting"
            label={t("cRecon")}
            detail={t("cReconD")}
          />
          <ConnectionIndicator
            variant="bar"
            status="unavailable"
            label={t("cUnav")}
            detail={t("cUnavD")}
          />
        </div>
      </div>

      <div className="grid gap-[12px]">
        <div className={caption}>{CAPTION.table}</div>
        <Tabs
          label={CAPTION.table}
          value={tab}
          onChange={setTab}
          items={[
            { id: "details", label: t("tDetails") },
            { id: "batches", label: t("tBatches") },
            { id: "movements", label: t("tMovements") },
          ]}
          end={
            <Segmented
              className="ms-auto mb-[6px]"
              label={CAPTION.table}
              value={seg}
              onChange={setSeg}
              items={[
                { id: "week", label: t("sWeek") },
                { id: "month", label: t("sMonth") },
              ]}
            />
          }
        />
        <div className="overflow-hidden rounded-control border border-border bg-surface">
          <TableHead columns={head} className="border-b-0 px-[12px]" />
          {rows.map(([name, qty, tone, label], i) => {
            const on = selected.includes(i);
            return (
              <TableRow
                key={name}
                columns={tableCols}
                selected={on}
                onActivate={() =>
                  setSelected(on ? selected.filter((x) => x !== i) : [...selected, i])
                }
                className="h-[44px] border-t border-b-0 px-[12px] hover:brightness-100"
              >
                <span
                  className={cn(
                    "grid size-[18px] place-items-center rounded-[5px] border-2 text-[12px] font-bold text-on-brand",
                    "transition-[background,border-color] duration-(--motion-feedback)",
                    on ? "border-brand bg-brand" : "border-border bg-transparent",
                  )}
                >
                  {on ? "✓" : ""}
                </span>
                <span>{name}</span>
                <span dir="ltr" className="text-end tabular-nums">
                  {qty}
                </span>
                <span className="justify-self-start">
                  <Badge tone={tone}>{label}</Badge>
                </span>
              </TableRow>
            );
          })}
          <TableSkeletonRow columns={tableCols} />
          <TableEmpty>{t("emptyRow")}</TableEmpty>
        </div>
      </div>

      <div className="grid gap-[12px]">
        <div className={caption}>{CAPTION.dialog}</div>
        <div className="grid place-items-center rounded-control bg-veil p-[20px]">
          <div
            role="dialog"
            aria-label={t("dTitle")}
            className="grid w-full max-w-[380px] gap-[12px] rounded-card border border-border bg-surface p-[20px] shadow-dialog"
          >
            <div className="text-[16px] font-medium">{t("dTitle")}</div>
            <div className="text-text-muted">{t("dBody")}</div>
            <div className="flex justify-between rounded-control bg-warning-bg px-[12px] py-[10px] font-medium text-warning-text">
              <span>{t("impact")}</span>
              <span dir="ltr">{CAPTION.amount}</span>
            </div>
            <div className="flex justify-end gap-[8px]">
              <Button variant="outline">{t("cancel")}</Button>
              <Button>{t("approve")}</Button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-[8px]">
          <Button variant="outline" onClick={() => addToast("success")}>
            {t("toastOk")}
          </Button>
          <Button variant="outline" onClick={() => addToast("warn")}>
            {t("toastWarn")}
          </Button>
          <Button variant="outline" onClick={() => addToast("danger")}>
            {t("toastErr")}
          </Button>
        </div>
        <div className="grid min-h-[20px] gap-[8px]">
          {toasts.map((x) => (
            <Toast
              key={x.id}
              tone={x.tone}
              message={toastMessage[x.tone]}
              requestId={`REQ-${x.id % 1000}`}
            />
          ))}
        </div>
        <EmptyState
          title={t("emptyT")}
          body={t("emptyB")}
          action={<Button variant="outline">{t("emptyA")}</Button>}
        />
      </div>
    </section>
  );
}

function StorefrontSection() {
  const t = useTranslations("dev.store");
  const card =
    "grid content-start gap-[12px] rounded-card border border-border bg-surface p-[16px]";
  return (
    <div data-theme="light" className="grid gap-[16px] px-[24px] pt-[8px] pb-[24px]">
      <h2 className="m-0 text-[16px] font-medium text-text">{t("heading")}</h2>
      <div
        dir="rtl"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-[16px]"
      >
        <div className={card}>
          <div className={caption}>
            {CAPTION.cards}
            {t("cardStates")}
          </div>
          <div className="grid grid-cols-2 gap-[10px]">
            <ProductCard
              name={t("p1")}
              noImageLabel={t("noImage")}
              price={t("p1Price")}
              updatedLabel={t("updated")}
              updatedOn="2026-10-21"
              availability="available"
              availabilityLabel={t("available")}
              action={<button className={storeButton.solid}>{t("addToCart")}</button>}
            />
            <ProductCard
              name={t("p2")}
              noImageLabel={t("noImage")}
              price={t("p2Price")}
              updatedLabel={t("updated")}
              updatedOn="2026-10-21"
              availability="confirm"
              availabilityLabel={t("confirm")}
              action={<button className={storeButton.solid}>{t("addToCart")}</button>}
            />
            <ProductCard
              name={t("p3")}
              noImageLabel={t("noImage")}
              price={t("p3Price")}
              updatedLabel={t("updated")}
              updatedOn="2026-10-21"
              availability="unavailable"
              availabilityLabel={t("unavailable")}
              action={<button className={storeButton.muted}>{t("details")}</button>}
            />
            <ProductCard
              name={t("p4")}
              noImageLabel={t("noImage")}
              price={t("noPrice")}
              rxNotice={t("rx")}
              availability="confirm"
              availabilityLabel={t("confirm")}
              action={<button className={storeButton.outline}>{t("requestReview")}</button>}
            />
          </div>
        </div>
        <div className={card}>
          <div className={caption}>{CAPTION.availability}</div>
          <div className="flex flex-wrap gap-[8px]">
            <AvailabilityBadge value="available" label={t("available")} />
            <AvailabilityBadge value="confirm" label={t("confirm")} />
            <AvailabilityBadge value="unavailable" label={t("unavailable")} />
          </div>
          <RxNotice>{t("rx")}</RxNotice>
          <PriceWithDate
            price={t("bigPrice")}
            updatedLabel={t("updated")}
            updatedOn="2026-10-21"
            size="lg"
          />
          <div className="text-[12px] font-medium text-warning-text">{t("confirmOnReview")}</div>
          <div className="text-[13px] text-text-muted">{t("noStock")}</div>
        </div>
        <div className={card}>
          <div className={caption}>{CAPTION.pickup}</div>
          <PickupSelector
            value="pickup"
            options={[
              { id: "pickup", title: t("pickup"), detail: t("payOnPickup") },
              { id: "delivery", title: t("delivery"), detail: t("notEnabled"), disabled: true },
            ]}
          />
          <div className={caption}>{CAPTION.chip}</div>
          <StorefrontStatusChip>{t("storeChip")}</StorefrontStatusChip>
        </div>
        <div className={card}>
          <div className={caption}>
            {CAPTION.stepper}
            {t("customer")}
          </div>
          <OrderStatusStepper
            steps={[
              { label: t("sNew"), state: "done" },
              { label: t("sConfirmed"), state: "current" },
              { label: t("sPreparing"), state: "todo" },
              { label: t("sReady"), state: "todo" },
              { label: t("sCompleted"), state: "todo" },
            ]}
          />
          <div className={caption}>
            {CAPTION.timeline}
            {t("staff")}
          </div>
          <OrderTimeline
            entries={[
              { time: "14:40", text: t("tl1") },
              { time: "14:32", text: t("tl2") },
            ]}
          />
        </div>
        <div className={card}>
          <div className={caption}>{CAPTION.publish}</div>
          <PublishToggle label={t("published")} checked />
          <PublishToggle label={t("published")} checked={false} disabled />
          <div className="grid gap-[2px] text-[13px]">
            <span className="text-success-text">{t("cPrice")}</span>
            <span className="text-success-text">{t("cClass")}</span>
            <span className="text-warning-text">{t("cImage")}</span>
            <span className="text-warning-text">{t("cDesc")}</span>
          </div>
        </div>
        <div className={card}>
          <div className={caption}>{CAPTION.whatsapp}</div>
          <WhatsAppAction href="#" message="" openLabel={t("openWa")} copyLabel={t("copyMsg")} />
          <div className="grid gap-[4px] text-[13px] text-text-muted">
            <span>{t("templates")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Gallery({ receipts }: { receipts: readonly ReceiptData[] }) {
  const t = useTranslations("dev.gallery");
  return (
    <div data-theme="light" className="min-h-screen bg-surface-subtle text-text">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(560px,100%),1fr))] gap-[24px] p-[24px]">
        <ThemeSection theme="light" />
        <ThemeSection theme="dark" />
      </div>
      <StorefrontSection />
      <div className="grid gap-[16px] px-[24px] pt-[8px] pb-[48px]">
        <div className="flex items-center gap-[16px]">
          <h2 className="m-0 text-[16px] font-medium text-text">
            {CAPTION.receipt}
            {t("always")}
          </h2>
          <Button variant="outline" onClick={() => window.print()}>
            {t("print")}
          </Button>
        </div>
        <div className="flex flex-wrap items-start gap-[32px]">
          {receipts.map((r) => (
            <ReceiptPreview key={r.locale} data={r} />
          ))}
        </div>
      </div>
    </div>
  );
}
