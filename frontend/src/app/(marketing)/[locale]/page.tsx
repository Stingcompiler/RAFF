import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";

import { BrandMark } from "@/components/ui/icons";
import { MarketingNav } from "@/features/marketing/MarketingNav";
import { StickyOpen } from "@/features/marketing/StickyOpen";
import { APP_HREF, BUTTON, DEMO_HREF } from "@/features/marketing/links";

type Item = { t: string; d: string; alt?: string };

const SECTION = "scroll-mt-[72px] px-[20px] py-[56px] max-[760px]:py-[40px]";
const H2 = "m-0 text-land-section font-bold";
const CARD = "grid content-start gap-[6px] rounded-card border border-border bg-surface p-[20px]";

/**
 * Raff's product page. Its one action — open Raff — is repeated after every stretch of
 * reading (the first screen, the features, the tour, the start, the trust, the questions
 * and the close), because the visitor should reach the system once convinced.
 */
export default async function MarketingPage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing");
  const features = t.raw("features.items") as Item[];
  const tour = t.raw("tour.items") as Item[];
  const steps = t.raw("steps.items") as Item[];
  const trust = t.raw("trust.items") as Item[];
  const faq = t.raw("faq.items") as { q: string; a: string }[];
  const links = [
    { href: "#features", label: t("nav.features") },
    { href: "#tour", label: t("nav.tour") },
    { href: "#how", label: t("nav.how") },
    { href: "#trust", label: t("nav.trust") },
    { href: "#faq", label: t("nav.faq") },
  ];

  /** The action, with the same words every time, and the demo shop as a quiet second way. */
  const action = (align: "start" | "center" = "start") => (
    <div
      className={`flex flex-wrap items-center gap-[16px] ${align === "center" ? "justify-center" : ""}`}
    >
      <Link href={APP_HREF} className={BUTTON}>
        {t("cta.open")}
      </Link>
      <Link
        href={DEMO_HREF}
        className="inline-flex min-h-[44px] items-center font-medium text-brand underline underline-offset-4"
      >
        {t("cta.demo")}
      </Link>
    </div>
  );
  const band = (key: string) => (
    <div
      key={key}
      className="mx-auto grid max-w-[1200px] justify-items-start px-[20px] pb-[8px] max-[760px]:justify-items-stretch"
    >
      {action()}
    </div>
  );

  return (
    <div id="top" className="min-h-dvh bg-canvas pb-[8px] text-body leading-body text-text">
      <MarketingNav
        labels={{
          brand: t("brand"),
          menu: t("nav.menu"),
          close: t("nav.close"),
          label: t("nav.label"),
          open: t("cta.open"),
          lang: t("nav.lang"),
          langHref: t("nav.langHref"),
          links,
        }}
      />
      <main>
        <section className="mx-auto grid max-w-[1200px] grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] items-center gap-[40px] px-[20px] pt-[56px] pb-[40px] max-[900px]:grid-cols-1 max-[760px]:pt-[32px]">
          <div className="grid content-start gap-[16px]">
            <span className="text-label font-semibold text-brand">{t("tag")}</span>
            <h1 className="m-0 text-land-hero font-bold [text-wrap:balance]">{t("hero.title")}</h1>
            <p className="m-0 max-w-[520px] text-land-hero-lead leading-loose text-text-secondary">
              {t("hero.lead")}
            </p>
            <div className="mt-[8px]">{action()}</div>
          </div>
          <Image
            src="/marketing/dashboard.jpg"
            alt={t("hero.shotAlt")}
            width={1440}
            height={900}
            priority
            unoptimized
            className="h-auto w-full rounded-panel border border-border shadow-3"
          />
        </section>

        <section id="features" className={`${SECTION} mx-auto max-w-[1200px]`}>
          <h2 className={H2}>{t("features.title")}</h2>
          <div className="mt-[24px] grid grid-cols-4 gap-[16px] max-[1000px]:grid-cols-2 max-[560px]:grid-cols-1">
            {features.map((f) => (
              <div key={f.t} className={CARD}>
                <h3 className="m-0 text-land-feature font-bold">{f.t}</h3>
                <p className="m-0 text-land-body leading-loose text-text-secondary">{f.d}</p>
              </div>
            ))}
          </div>
        </section>
        {band("after-features")}

        <section id="tour" className={`${SECTION} mx-auto max-w-[1200px]`}>
          <h2 className={H2}>{t("tour.title")}</h2>
          <div className="mt-[24px] grid grid-cols-2 gap-[24px] max-[900px]:grid-cols-1">
            {tour.map((item, i) => (
              <figure key={item.t} className="m-0 grid gap-[12px]">
                <Image
                  src={i === 0 ? "/marketing/dashboard.jpg" : "/marketing/inventory.jpg"}
                  alt={item.alt ?? item.t}
                  width={1440}
                  height={900}
                  loading="lazy"
                  unoptimized
                  className="h-auto w-full rounded-card border border-border"
                />
                <figcaption className="grid gap-[2px]">
                  <span className="text-land-feature font-bold">{item.t}</span>
                  <span className="text-land-body text-text-secondary">{item.d}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
        {band("after-tour")}

        <section id="how" className={`${SECTION} mx-auto max-w-[1200px]`}>
          <h2 className={H2}>{t("steps.title")}</h2>
          <ol className="m-0 mt-[24px] grid list-none grid-cols-3 gap-[16px] p-0 max-[900px]:grid-cols-1">
            {steps.map((s, i) => (
              <li key={s.t} className={CARD}>
                <span dir="ltr" className="num text-land-hero font-bold text-brand">
                  {i + 1}
                </span>
                <h3 className="m-0 text-land-feature font-bold">{s.t}</h3>
                <p className="m-0 text-land-body leading-loose text-text-secondary">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="trust" className="bg-surface-subtle">
          <div className={`${SECTION} mx-auto max-w-[1200px]`}>
            <h2 className={H2}>{t("trust.title")}</h2>
            <div className="mt-[24px] grid grid-cols-4 gap-[16px] max-[1000px]:grid-cols-2 max-[560px]:grid-cols-1">
              {trust.map((x) => (
                <div key={x.t} className={`${CARD} bg-canvas`}>
                  <h3 className="m-0 text-land-feature font-bold">{x.t}</h3>
                  <p className="m-0 text-land-body leading-loose text-text-secondary">{x.d}</p>
                </div>
              ))}
            </div>
            <div className="mt-[28px]">{action()}</div>
          </div>
        </section>

        <section id="faq" className={`${SECTION} mx-auto max-w-[860px]`}>
          <h2 className={H2}>{t("faq.title")}</h2>
          <div className="mt-[16px] border-t border-border">
            {faq.map((f, i) => (
              <details key={f.q} open={i === 0} className="group border-b border-border">
                <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-[12px] text-land-lead font-medium">
                  {f.q}
                  <span
                    aria-hidden="true"
                    className="text-land-feature text-brand transition-[transform] duration-(--motion-panel-in) group-open:rotate-45"
                  >
                    {PLUS}
                  </span>
                </summary>
                <div className="max-w-[680px] pb-[16px] text-land-body leading-loose text-text-secondary">
                  {f.a}
                </div>
              </details>
            ))}
          </div>
          <div className="mt-[24px]">{action()}</div>
        </section>

        <section className="mx-[20px] my-[24px] rounded-panel bg-brand px-[24px] py-[48px] text-center text-on-brand max-[760px]:py-[36px]">
          <div className="mx-auto grid max-w-[640px] justify-items-center gap-[12px]">
            <h2 className="m-0 text-land-section font-bold">{t("final.title")}</h2>
            <p className="m-0 text-land-body opacity-90">{t("final.lead")}</p>
            <Link
              href={APP_HREF}
              className="mt-[8px] inline-flex min-h-[48px] items-center justify-center rounded-card bg-on-brand px-[28px] text-lead font-semibold whitespace-nowrap text-brand no-underline"
            >
              {t("cta.open")}
            </Link>
            <Link
              href={DEMO_HREF}
              className="inline-flex min-h-[44px] items-center font-medium text-on-brand underline underline-offset-4"
            >
              {t("cta.demo")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-[12px] px-[20px] py-[20px] text-label text-text-muted">
          <span className="flex items-center gap-[8px] font-semibold text-text">
            <BrandMark size={20} className="text-brand" />
            {t("brand")}
            <span className="font-normal text-text-muted">{t("foot.tag")}</span>
          </span>
          <span>{t("foot.note")}</span>
        </div>
      </footer>
      <StickyOpen label={t("cta.open")} />
    </div>
  );
}

const PLUS = "+";
