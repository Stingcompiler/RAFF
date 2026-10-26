import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import type { Store } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";

export default async function AboutPage() {
  const t = await getTranslations("store");
  const ar = (await getLocale()) === "ar";
  const store = await serverGet<Store>("/public/store/").catch(() => null);
  return (
    <section className="mx-auto max-w-[680px] px-[20px] py-[40px]">
      <div className="grid gap-[14px]">
        <h1 className="m-0 text-land-section font-semibold">{t("nav.about")}</h1>
        <p className="m-0 text-land-lead leading-loose text-text-secondary">
          {store ? (ar ? store.about_ar : store.about_en) : ""}
        </p>
        <div className="rounded-control bg-warning-bg px-[14px] py-[12px] text-body font-medium text-warning-text">
          {t("aboutNote")}
        </div>
        <Link
          href="/contact"
          className="inline-flex min-h-[48px] items-center justify-self-start rounded-control border border-border-strong bg-surface px-[20px] font-semibold text-brand no-underline"
        >
          {t("contactUs")}
        </Link>
      </div>
    </section>
  );
}
