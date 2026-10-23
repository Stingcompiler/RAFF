import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import {
  CheckCircleIcon,
  MessageIcon,
  ShieldIcon,
  StoreIcon,
  TagIcon,
  UserCheckIcon,
} from "@/components/ui/icons";
import { ProductTile } from "@/features/store/ProductTile";
import { type Product, type Store, waLink } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";

const ICONS = [TagIcon, CheckCircleIcon, UserCheckIcon, MessageIcon, StoreIcon, ShieldIcon];
const PLUS = "+";

/** The pharmacy's home (PHARMACY-WEBSITE §4): hero, featured items, how it works, FAQ. */
export default async function StorefrontHome() {
  const t = await getTranslations("store");
  const ar = (await getLocale()) === "ar";
  const [store, products] = await Promise.all([
    serverGet<Store>("/public/store/").catch(() => null),
    serverGet<Product[]>("/public/products/?limit=4").catch(() => null),
  ]);
  const features = t.raw("features") as { t: string; d: string }[];
  const steps = t.raw("steps") as { t: string; d: string }[];
  const faq = t.raw("faq") as { q: string; a: string }[];
  const title = store ? (ar ? store.hero_title_ar : store.hero_title_en) : "";
  const lead = store ? (ar ? store.hero_lead_ar : store.hero_lead_en) : "";
  const address = store
    ? [ar ? store.address_ar : store.address_en, store.hours].filter(Boolean).join(" · ")
    : "";
  return (
    <>
      <section className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-center gap-[32px] px-[20px] pt-[40px] pb-[24px]">
        <div>
          <h1 className="m-0 text-[44px] leading-[1.2] font-semibold [text-wrap:balance] max-[600px]:text-[32px]">
            {title || t("storeTitle")}
          </h1>
          {lead && (
            <p className="mt-[14px] mb-0 max-w-[460px] text-[18px] leading-[1.7] text-text-secondary">
              {lead}
            </p>
          )}
          <div className="mt-[24px] flex flex-wrap gap-[12px]">
            <Link
              href="/store"
              className="inline-flex min-h-[52px] items-center rounded-card bg-brand px-[24px] text-[16px] font-semibold whitespace-nowrap text-on-brand no-underline transition-[transform] duration-(--motion-feedback) hover:-translate-y-[2px]"
            >
              {t("browse")}
            </Link>
            {store?.whatsapp && (
              <a
                href={waLink(store.whatsapp)}
                className="inline-flex min-h-[52px] items-center rounded-card border border-border-strong bg-surface px-[20px] font-medium whitespace-nowrap text-text no-underline"
              >
                {t("contactUs")}
              </a>
            )}
          </div>
          {address && <div className="mt-[20px] text-[14px] text-text-muted">{address}</div>}
        </div>
        <div className="grid h-[340px] place-items-center rounded-panel bg-surface-subtle text-text-muted">
          {t("imgPh")}
        </div>
      </section>

      <section className="px-[20px] pt-[24px] pb-[8px]">
        <h2 className="m-0 text-[26px] font-semibold">{t("featured")}</h2>
        <div className="mt-[20px] grid grid-cols-4 gap-[16px] max-[1000px]:grid-cols-2">
          {(products ?? []).map((p) => (
            <ProductTile key={p.slug} product={p} />
          ))}
        </div>
        <div className="mt-[20px]">
          <Link
            href="/store"
            className="inline-flex min-h-[44px] items-center rounded-control border border-border-strong px-[20px] font-semibold text-brand no-underline"
          >
            {t("viewAll")}
          </Link>
        </div>
      </section>

      <section className="px-[20px] pt-[48px] pb-[16px]">
        <h2 className="mt-0 mb-[20px] text-[26px] font-semibold">{t("howWork")}</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-x-[32px]">
          {features.map((f, i) => {
            const Icon = ICONS[i] ?? TagIcon;
            return (
              <div
                key={f.t}
                className="grid grid-cols-[36px_1fr] gap-[12px] border-t border-border py-[18px]"
              >
                <Icon size={26} className="text-brand" />
                <div>
                  <div className="font-semibold">{f.t}</div>
                  <div className="mt-[2px] text-[15px] leading-[1.6] text-text-secondary">
                    {f.d}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-[20px] mt-[32px] rounded-panel bg-brand px-[24px] py-[32px] text-on-brand">
        <h2 className="mt-0 mb-[20px] text-[26px] font-semibold">{t("howOrder")}</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-[20px]">
          {steps.map((s, i) => (
            <div key={s.t} className="flex items-start gap-[14px]">
              <span
                dir="ltr"
                className="text-[40px] leading-none font-medium text-brand-subtle tabular-nums"
              >
                {i + 1}
              </span>
              <div>
                <div className="text-[17px] font-semibold">{s.t}</div>
                <div className="text-[15px] leading-[1.6] opacity-90">{s.d}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-[20px] rounded-control bg-on-brand/15 px-[14px] py-[10px] text-[14px]">
          {t("howNote")}
        </div>
      </section>

      <section className="px-[20px] pt-[48px] pb-[16px]">
        <h2 className="mt-0 mb-[12px] text-[26px] font-semibold">{t("faqT")}</h2>
        <div className="border-t border-border">
          {faq.map((f, i) => (
            <details key={f.q} open={i === 0} className="group border-b border-border">
              <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-[12px] text-[17px] font-medium">
                {f.q}
                <span
                  aria-hidden="true"
                  className="text-[22px] text-brand transition-[transform] duration-(--motion-panel-in) group-open:rotate-45"
                >
                  {PLUS}
                </span>
              </summary>
              <div className="max-w-[640px] pb-[16px] leading-[1.7] text-text-secondary">{f.a}</div>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
