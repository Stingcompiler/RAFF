"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { ConnectionIndicator } from "@/components/ui/ConnectionIndicator";
import { BrandMark, CircleXIcon, SearchIcon, WarningIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend } from "@/lib/api/browser";
import { timeOfDay } from "@/lib/format";
import { usePhone } from "@/lib/phone";

import { ApprovedDialog } from "./ApprovedDialog";
import { BatchDialog } from "./BatchDialog";
import { CartPanel } from "./CartPanel";
import { HeldDialog } from "./HeldDialog";
import { PaymentDialog } from "./PaymentDialog";
import { PhoneSell } from "./PhoneSell";
import { ResultsTable, sellable } from "./ResultsTable";
import { ShiftDialog } from "./ShiftDialog";
import {
  type CartLine,
  type Customer,
  type FromOrder,
  errorCode,
  errorKey,
  type HeldSale,
  type LineIn,
  type PosItem,
  type Receipt,
  requestRef,
  type SaleRequest,
  type SaleResult,
  type ShiftSummary,
  toLineIn,
  type Unit,
} from "./types";
import { useConnection } from "./useConnection";
import { usePosCart } from "./usePosCart";

const APPROVE_TIMEOUT_MS = 15000;
const MULTIPLIER = /^(\d{1,3})\*$/;
const F2 = "F2";
const TIMES = "×";
const SEP = "·";
const KEYS = [
  ["F2", "search"],
  ["F4", "hold"],
  ["F6", "resume"],
  ["F8", "pay"],
  ["F9", "return"],
  ["Esc", "cancel"],
] as const;

const searchItems = (query: string) =>
  apiGet<PosItem[]>(`/pos/items/?q=${encodeURIComponent(query.trim())}`);

type Phase = "idle" | "approving" | "verify" | "failed";
type Dialogs = "pay" | "held" | "batch" | null;

export type PosScreenProps = {
  deviceId: string;
  branchName: string;
  counterName: string;
  user: { name: string; initial: string };
  canDiscount: boolean;
  canOpenShift: boolean;
  initialItems: PosItem[];
  initialShift: ShiftSummary;
  /** Opened from a ready storefront order: its lines are loaded and locked. */
  fromOrder?: FromOrder | null;
};

/** Point of sale (Raff POS). Keyboard first; the server prices, allocates and posts. */
export function PosScreen(props: PosScreenProps) {
  const t = useTranslations("pos");
  const tErr = useTranslations("pos.errors");
  const tConn = useTranslations("connection");
  const ar = useLocale() === "ar";
  const router = useRouter();
  const toast = useToast();
  const conn = useConnection();
  const phone = usePhone();
  const order = props.fromOrder ?? null;
  // An order's cart is kept apart from the counter's own draft.
  const cart = usePosCart(order ? `${props.deviceId}.order.${order.id}` : props.deviceId);
  const input = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [mult, setMult] = useState(1);
  const [rows, setRows] = useState<PosItem[]>(props.initialItems);
  // The query `rows` answer; Enter never acts on results for an older query.
  const [rowsFor, setRowsFor] = useState("");
  const [sel, setSel] = useState(0);
  const [shift, setShift] = useState<ShiftSummary>(props.initialShift);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [batchFor, setBatchFor] = useState<string | null>(null);
  const [phaseState, setPhase] = useState<Phase>("idle");
  const [payError, setPayError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<SaleRequest | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [approved, setApproved] = useState<{
    sale: SaleResult;
    receipt: Receipt;
    key: string;
  } | null>(null);

  // A key left over from an unanswered approval (e.g. after a reload) must be checked first.
  const phase: Phase = phaseState === "idle" && cart.pendingKey ? "verify" : phaseState;

  useEffect(() => {
    if (!order) return;
    const timer = setTimeout(() =>
      cart.setLines((prev) =>
        prev.length
          ? prev
          : order.lines.flatMap((l) => {
              const unit = l.item.units.find((u) => u.id === l.unit_id);
              return unit
                ? [
                    {
                      key: crypto.randomUUID(),
                      item: l.item,
                      unit,
                      quantity: l.quantity,
                      discountPct: 0,
                      batch: null,
                      locked: true,
                    },
                  ]
                : [];
            }),
      ),
    );
    return () => clearTimeout(timer);
    // Load once per order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  const focusSearch = useCallback(() => setTimeout(() => input.current?.focus(), 0), []);

  // Results follow the query (the server searches Arabic and English names, generic names, codes).
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const res = await searchItems(query);
      if (live && res.ok) {
        setRows(res.data);
        setRowsFor(query.trim());
        setSel(0);
      }
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  const refreshShift = useCallback(async () => {
    const res = await apiGet<ShiftSummary>("/shifts/current/");
    if (res.ok) setShift(res.data);
  }, []);

  const addItem = useCallback(
    (item: PosItem, unit: Unit | null) => {
      if (!unit || order) return;
      const quantity = mult;
      cart.setLines((prev) => {
        const same = prev.find((l) => l.item.id === item.id && l.unit.id === unit.id && !l.batch);
        if (same) {
          return prev.map((l) =>
            l === same ? { ...l, quantity: Math.min(999, l.quantity + quantity) } : l,
          );
        }
        return [
          ...prev,
          { key: crypto.randomUUID(), item, unit, quantity, discountPct: 0, batch: null },
        ];
      });
      setMult(1);
      setQuery("");
      focusSearch();
    },
    [cart, mult, focusSearch, order],
  );

  const onEnter = async () => {
    const code = query.trim();
    if (code && !/\s/.test(code)) {
      const res = await apiGet<PosItem>(`/pos/barcode/?code=${encodeURIComponent(code)}`);
      if (res.ok) return addItem(res.data, res.data.unit);
    }
    let list = rows;
    let index = sel;
    if (rowsFor !== code) {
      const res = await searchItems(code);
      if (!res.ok) return;
      list = res.data;
      index = 0;
      setRows(list);
      setRowsFor(code);
      setSel(0);
    }
    const row = list[index];
    if (row && sellable(row)) addItem(row, row.unit);
  };

  const hold = useCallback(async () => {
    if (cart.lines.length === 0 || phase !== "idle" || order) return false;
    const res = await apiSend<HeldSale>("POST", "/sales/held/", {
      lines: cart.lines.map(toLineIn),
    });
    if (!res.ok) {
      toast.push("danger", tErr("failed"));
      return false;
    }
    cart.clear();
    setCustomer(null);
    toast.push("success", t("heldDone"));
    focusSearch();
    return true;
  }, [cart, phase, toast, t, tErr, focusSearch, order]);

  const resume = async (held: HeldSale) => {
    if (cart.lines.length && !(await hold())) return;
    const res = await apiSend<HeldSale>("POST", `/sales/held/${held.id}/resume/`);
    if (!res.ok) return;
    const saved = (res.data.cart ?? []) as LineIn[];
    const ids = [...new Set(saved.map((l) => l.item_id))].join(",");
    const items = ids ? await apiGet<PosItem[]>(`/pos/items/?ids=${ids}`) : null;
    const byId = new Map((items?.ok ? items.data : []).map((i) => [i.id, i]));
    const restored: CartLine[] = saved.flatMap((l) => {
      const item = byId.get(l.item_id);
      const unit = item?.units.find((u) => u.id === l.unit_id);
      if (!item || !unit) return [];
      return [
        {
          key: crypto.randomUUID(),
          item,
          unit,
          quantity: l.quantity,
          discountPct: Number(l.discount_pct ?? 0),
          batch: l.batch_id ? { id: l.batch_id, no: "" } : null,
        },
      ];
    });
    cart.setLines(() => restored);
    setDialog(null);
    focusSearch();
  };

  const finish = async (sale: SaleResult, key: string) => {
    const receipt = await apiGet<Receipt>(`/sales/${sale.id}/receipt/`);
    cart.clear();
    setCustomer(null);
    setLastRequest(null);
    setPhase("idle");
    setDialog(null);
    if (receipt.ok) setApproved({ sale, receipt: receipt.data, key });
    void refreshShift();
  };

  /** Approve with the cart's Idempotency-Key; a retry re-sends the same key and payload. */
  const approve = async (request: SaleRequest) => {
    if (phase === "approving") return;
    const key = cart.pendingKey ?? crypto.randomUUID();
    cart.setPendingKey(key);
    setLastRequest(request);
    setPhase("approving");
    setPayError(null);
    const res = await apiSend<SaleResult>("POST", "/sales/", request, {
      idempotencyKey: key,
      timeoutMs: APPROVE_TIMEOUT_MS,
    });
    if (res.ok) return finish(res.data, key);
    if (res.status === 0) {
      // Unknown outcome: never approve again before asking the server about this key.
      setDialog(null);
      setPhase("verify");
      return;
    }
    if (res.status >= 500) {
      setDialog(null);
      setPhase("failed");
      return;
    }
    // Rejected (nothing recorded): the next attempt gets a fresh key.
    cart.setPendingKey(null);
    setPhase("idle");
    const code = errorCode(res.error);
    setPayError(tErr(errorKey(code)));
  };

  const checkResult = async () => {
    const key = cart.pendingKey;
    if (!key) return setPhase("idle");
    const res = await apiGet<SaleResult>(`/sales/by-key/${key}/`);
    if (res.ok) return finish(res.data, key);
    if (res.status === 404) setPhase("failed");
  };

  const retry = () => {
    if (lastRequest) void approve(lastRequest);
    else {
      cart.setPendingKey(null);
      setPhase("idle");
    }
  };

  const shiftOpen = shift.shift !== null;
  const offline = conn === "unavailable";
  const payDisabled =
    offline || !cart.ready || !shiftOpen || phase === "verify" || phase === "approving";
  const anyDialog = dialog !== null || approved !== null || !shiftOpen;

  // Counter keys (disabled while a dialog is open; the dialog handles Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyDialog) return;
      if (e.key === "F2") {
        e.preventDefault();
        input.current?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        void hold();
      } else if (e.key === "F6") {
        e.preventDefault();
        setDialog("held");
      } else if (e.key === "F8") {
        e.preventDefault();
        if (!payDisabled) setDialog("pay");
      } else if (e.key === "F9") {
        e.preventDefault();
        router.push("/returns");
      } else if (e.key === "Escape") {
        setQuery("");
        setMult(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [anyDialog, hold, payDisabled, router]);

  useEffect(() => {
    if (!anyDialog) input.current?.focus();
  }, [anyDialog]);

  const onQueryKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, Math.max(0, rows.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void onEnter();
    }
  };

  const logMissing = async () => {
    const res = await apiSend("POST", "/pos/missing/", { query: query.trim() });
    if (res.ok) {
      toast.push("success", t("logged"));
      setQuery("");
      focusSearch();
    }
  };

  const multText = [TIMES, mult].join(" ");
  const batchLine = cart.lines.find((l) => l.key === batchFor) ?? null;
  const pending = phase === "verify" || phase === "failed" ? 1 : 0;
  const connText = {
    online: t("connOnline"),
    reconnecting: t("connReconnecting"),
    unavailable: t("connOffline"),
  }[conn];
  const shiftText = shift.shift
    ? t("shiftLabel", { number: shift.shift.number, time: timeOfDay(shift.shift.opened_at) })
    : t("noShift");

  const banners = (
    <>
      {offline && (
        <div
          role="alert"
          className="flex flex-none items-center gap-[12px] border-b border-danger-solid bg-danger-bg px-[16px] py-[10px] font-medium text-danger-text"
        >
          <WarningIcon />
          {t("offlineMsg")}
        </div>
      )}
      {conn === "reconnecting" && (
        <div
          role="status"
          className="flex flex-none items-center gap-[12px] border-b border-warning-solid bg-warning-bg px-[16px] py-[10px] font-medium text-warning-text"
        >
          <span className="size-[10px] animate-[raff-pulse_1.4s_ease-in-out_infinite] rounded-full bg-current" />
          {t("reconnMsg")}
        </div>
      )}
      {phase === "verify" && cart.pendingKey && (
        <div
          role="alert"
          className="flex flex-none items-center gap-[12px] border-b border-warning-solid bg-warning-bg px-[16px] py-[10px] font-medium text-warning-text"
        >
          <span className="size-[10px] animate-[raff-pulse_1.4s_ease-in-out_infinite] rounded-full bg-current" />
          <span className="flex-1">{t("verifyMsg")}</span>
          <span dir="ltr" className="text-[12px] font-normal">
            {requestRef(cart.pendingKey)}
          </span>
          <button
            type="button"
            onClick={() => void checkResult()}
            className="min-h-[36px] cursor-pointer rounded-control border border-current bg-transparent px-[14px] py-[2px] text-[13px] text-inherit"
          >
            {t("check")}
          </button>
        </div>
      )}
      {phase === "failed" && (
        <div
          role="alert"
          className="flex flex-none items-center gap-[12px] border-b border-danger-solid bg-danger-bg px-[16px] py-[10px] font-medium text-danger-text"
        >
          <CircleXIcon />
          <span className="flex-1">{t("failMsg")}</span>
          {cart.pendingKey && (
            <span dir="ltr" className="text-[12px] font-normal">
              {requestRef(cart.pendingKey)}
            </span>
          )}
          <button
            type="button"
            onClick={retry}
            disabled={offline}
            className="cursor-pointer rounded-control border border-current bg-transparent px-[10px] py-[2px] text-[12px] text-inherit"
          >
            {t("retry")}
          </button>
        </div>
      )}
    </>
  );
  const dialogs = (
    <>
      {dialog === "pay" && cart.quoted.quote && (
        <PaymentDialog
          open
          total={cart.quoted.quote.total}
          busy={phase === "approving"}
          error={payError}
          lines={cart.lines.map(toLineIn)}
          onClose={() => {
            setDialog(null);
            focusSearch();
          }}
          onConfirm={(request, chosen) => {
            setCustomer(chosen);
            void approve(order ? { ...request, order_id: order.id } : request);
          }}
        />
      )}
      {dialog === "held" && (
        <HeldDialog onClose={() => setDialog(null)} onResume={(h) => void resume(h)} />
      )}
      {dialog === "batch" && batchLine && (
        <BatchDialog
          line={batchLine}
          onClose={() => setDialog(null)}
          onChoose={(batch) => {
            cart.setLines((prev) =>
              prev.map((l) => (l.key === batchLine.key ? { ...l, batch } : l)),
            );
            setDialog(null);
          }}
        />
      )}
      {!shiftOpen && (
        <ShiftDialog
          canOpen={props.canOpenShift}
          onOpened={() => void refreshShift()}
          onLeave={() => router.push("/dashboard")}
        />
      )}
      {approved && (
        <ApprovedDialog
          sale={approved.sale}
          receipt={approved.receipt}
          requestKey={approved.key}
          onNewSale={() => {
            setApproved(null);
            if (order) router.replace("/pos");
            focusSearch();
          }}
        />
      )}
    </>
  );

  if (phone) {
    return (
      <PhoneSell
        connection={{
          status: conn,
          text:
            conn === "online"
              ? tConn("chipOnline")
              : conn === "unavailable"
                ? tConn("chipUnavailable")
                : connText,
        }}
        banners={banners}
        dialogs={dialogs}
        rows={rows}
        catalogueSize={props.initialItems.length}
        query={query}
        onQuery={setQuery}
        lines={cart.lines}
        quoted={cart.quoted}
        locked={order !== null}
        payDisabled={payDisabled}
        onAdd={(row) => addItem(row, row.unit)}
        onPay={() => {
          setPayError(null);
          setDialog("pay");
        }}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <div
        data-density="compact"
        className="relative flex h-dvh min-h-[560px] min-w-[1024px] flex-col overflow-hidden bg-canvas text-text"
      >
        <header className="flex h-[52px] flex-none items-center gap-[20px] border-b border-border bg-surface-subtle px-[16px]">
          <div className="flex items-center gap-[8px] text-[18px] font-bold text-brand">
            <BrandMark />
            {t("brand")}
          </div>
          <div className="flex flex-1 gap-[16px] text-[13px] text-text-muted">
            <span>{props.branchName}</span>
            <span>{SEP}</span>
            <span>{props.counterName}</span>
            <span>{SEP}</span>
            <span data-testid="shift-label">{shiftText}</span>
          </div>
          <ConnectionIndicator
            status={conn}
            label={connText}
            detail={t("pending", { count: pending })}
          />
          <div className="flex items-center gap-[8px] font-medium">
            <span className="grid size-[28px] place-items-center rounded-full bg-brand-subtle text-[12px] text-text">
              {props.user.initial}
            </span>
            {props.user.name}
          </div>
        </header>

        {banners}

        <div className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-[62] flex-col gap-[12px] p-[16px]">
            <div className="flex h-[56px] items-center gap-[12px] rounded-card border-2 border-brand bg-surface px-[16px] shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-focus)]">
              <SearchIcon size={22} className="text-text-muted" />
              {mult > 1 && (
                <span
                  className="rounded-full bg-brand-subtle px-[10px] py-[2px] font-latin text-[13px] font-semibold"
                  data-testid="multiplier"
                >
                  {multText}
                </span>
              )}
              <input
                ref={input}
                dir="auto"
                aria-label={t("query")}
                placeholder={t("query")}
                autoComplete="off"
                value={query}
                onChange={(e) => {
                  const m = MULTIPLIER.exec(e.target.value.trim());
                  if (m) {
                    setMult(Math.max(1, Number(m[1])));
                    setQuery("");
                  } else setQuery(e.target.value);
                }}
                onKeyDown={onQueryKey}
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-[18px] leading-[1.4] text-text outline-none"
              />
              <span
                dir="ltr"
                className="rounded-control border border-b-2 border-border px-[8px] py-[2px] font-latin text-[12px] font-medium text-text-muted"
              >
                {F2}
              </span>
            </div>
            <ResultsTable
              rows={rows}
              selected={sel}
              query={query}
              onSelect={setSel}
              onAdd={(row) => addItem(row, row.unit)}
              onLogMissing={() => void logMissing()}
            />
          </main>
          <CartPanel
            fromOrder={order}
            lines={cart.lines}
            quoted={cart.quoted}
            customerName={customer ? (ar ? customer.name_ar : customer.name_en) : null}
            canDiscount={props.canDiscount}
            payDisabled={payDisabled}
            onChange={(key, patch) =>
              cart.setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
            }
            onRemove={(key) => cart.setLines((prev) => prev.filter((l) => l.key !== key))}
            onBatch={(key) => {
              setBatchFor(key);
              setDialog("batch");
            }}
            onPay={() => {
              setPayError(null);
              setDialog("pay");
            }}
            onHold={() => void hold()}
          />
        </div>

        <footer className="flex h-[36px] flex-none items-center gap-[20px] border-t border-border bg-surface-subtle px-[16px] text-[12px] text-text-muted">
          {KEYS.map(([key, label]) => (
            <span key={key} className="flex items-center gap-[6px]">
              <span
                dir="ltr"
                className="rounded-[5px] border border-b-2 border-border px-[6px] font-latin text-[11px] font-medium text-text"
              >
                {key}
              </span>
              {t(`keys.${label}`)}
            </span>
          ))}
        </footer>

        {dialogs}
      </div>
    </div>
  );
}
