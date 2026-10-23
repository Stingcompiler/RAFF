import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import type { Store } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";

export default async function AboutPage() {
  const t = await getTranslations("store");
  const ar = (await getLocale()) === "ar";
  const store = await serverGet<Store>("/public/store/").catch(() => null);
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-[28px] px-[20px] py-[32px]">
      <div className="grid max-w-[560px] gap-[14px]">
        <h1 className="m-0 text-[32px] font-semibold">{t("nav.about")}</h1>
        <p className="m-0 text-[17px] leading-[1.8] text-text-secondary">
          {store ? (ar ? store.about_ar : store.about_en) : ""}
        </p>
        <div className="rounded-control bg-warning-bg px-[14px] py-[12px] text-[14px] font-medium text-warning-text">
          {t("aboutNote")}
        </div>
        <Link
          href="/contact"
          className="inline-flex min-h-[48px] items-center justify-self-start rounded-control border border-border-strong bg-surface px-[20px] font-semibold text-brand no-underline"
        >
          {t("contactUs")}
        </Link>
      </div>
      <div className="grid h-[320px] place-items-center rounded-panel bg-surface-subtle text-text-muted">
        {t("imgPh")}
      </div>
    </section>
  );
}
