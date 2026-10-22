"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { apiSend } from "@/lib/api/browser";
import { cleanAmount } from "@/lib/decimal";

import { errorCode, errorKey } from "./types";

type Props = { canOpen: boolean; onOpened: () => void; onLeave: () => void };

/** The counter cannot sell until a shift is open on this device. */
export function ShiftDialog({ canOpen, onOpened, onLeave }: Props) {
  const t = useTranslations("pos");
  const tErr = useTranslations("pos.errors");
  const [opening, setOpening] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !opening) return;
    setBusy(true);
    const res = await apiSend("POST", "/shifts/", { opening_cash: opening });
    setBusy(false);
    if (res.ok) onOpened();
    else {
      const code = errorCode(res.error);
      setError(tErr(errorKey(code)));
    }
  };

  return (
    <Dialog open labelledBy="shift-title" className="w-[440px] gap-[16px]">
      <form onSubmit={submit} className="grid gap-[16px]">
        <div id="shift-title" className="text-[16px] font-medium">
          {t("openShift")}
        </div>
        <div className="text-muted">{canOpen ? t("shiftHint") : t("shiftNoPermission")}</div>
        {canOpen && (
          <>
            <label className="grid gap-[4px] text-[12px] font-medium text-muted">
              {t("opening")}
              <input
                dir="ltr"
                inputMode="decimal"
                value={opening}
                onChange={(e) => setOpening(cleanAmount(e.target.value))}
                className="h-[44px] rounded-[8px] border-2 border-primary bg-bg px-[12px] text-[18px] font-medium text-ink outline-none"
              />
            </label>
            {error && (
              <div
                role="alert"
                className="rounded-[8px] bg-danger-bg px-[12px] py-[10px] text-danger"
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy || !opening}
              className="h-[48px] cursor-pointer rounded-[10px] border-0 bg-primary text-[16px] font-semibold text-primary-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
            >
              {t("openShift")}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onLeave}
          className="h-[44px] cursor-pointer rounded-[10px] border border-line bg-transparent font-medium text-ink"
        >
          {t("cancel")}
        </button>
      </form>
    </Dialog>
  );
}
