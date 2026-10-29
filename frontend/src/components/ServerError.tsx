"use client";

import { useTranslations } from "next-intl";

/** A screen whose data could not be read: say so, and offer to try again (review C-05). */
export function ServerError({ reset }: { reset: () => void }) {
  const t = useTranslations("common");
  return (
    <main
      role="alert"
      className="mx-auto grid max-w-[520px] justify-items-center gap-[12px] px-[20px] py-[64px] text-center text-text"
    >
      <h1 className="m-0 type-section">{t("loadFailedT")}</h1>
      <p className="m-0 text-text-secondary">{t("loadFailedB")}</p>
      <button
        type="button"
        onClick={reset}
        className="min-h-[44px] cursor-pointer rounded-control border-0 bg-brand px-[20px] font-semibold text-on-brand"
      >
        {t("retry")}
      </button>
    </main>
  );
}
