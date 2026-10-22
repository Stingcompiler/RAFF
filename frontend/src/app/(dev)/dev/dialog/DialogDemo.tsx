"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";

/** Exercises the confirm dialog: focus trap, Escape, busy state. */
export function DialogDemo() {
  const t = useTranslations("dev.gallery");
  const c = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <main className="p-[24px]">
      <Button onClick={() => setOpen(true)}>{t("dTitle")}</Button>
      <ConfirmDialog
        open={open}
        title={t("dTitle")}
        body={t("dBody")}
        impact={[{ label: t("impact"), value: "−1,512,000" }]}
        cancelLabel={c("back")}
        confirmLabel={c("approve")}
        busyLabel={c("approving")}
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={() => setBusy(true)}
      />
    </main>
  );
}
