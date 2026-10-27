import { getLocale, getTranslations } from "next-intl/server";

import { MessageCircle } from "lucide-react";

import { InquiryForm } from "@/features/store/InquiryForm";
import { type Store, waLink } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";

export default async function ContactPage() {
  const t = await getTranslations("store");
  const ar = (await getLocale()) === "ar";
  const store = await serverGet<Store>("/public/store/").catch(() => null);
  const rows: [string, string, boolean][] = store
    ? [
        [t("addrL"), ar ? store.address_ar : store.address_en, false],
        [t("hoursL"), store.hours, true],
        [t("waL"), store.whatsapp ? `+${store.whatsapp}` : "", true],
      ]
    : [];
  return (
    <section className="mx-auto max-w-[680px] px-[20px] py-[40px]">
      <div className="grid content-start gap-[16px]">
        <h1 className="m-0 text-land-section font-semibold">{t("nav.contact")}</h1>
        <p className="m-0 text-text-secondary">{t("contactLead")}</p>
        {store?.whatsapp && (
          <a
            href={waLink(store.whatsapp, t("waGreeting"))}
            className="inline-flex min-h-[52px] items-center justify-center gap-[10px] rounded-card bg-brand px-[20px] text-lead font-semibold text-on-brand no-underline"
          >
            <MessageCircle size={22} aria-hidden="true" />
            {t("waDirect")}
          </a>
        )}
        <dl className="m-0 grid rounded-card border border-border bg-surface px-[16px]">
          {rows.map(([label, value, ltr]) => (
            <div
              key={label}
              className="flex min-h-[48px] items-center justify-between gap-[12px] border-b border-border last:border-b-0"
            >
              <dt className="text-text-muted">{label}</dt>
              <dd className={ltr ? "m-0 num" : "m-0"} dir={ltr ? "ltr" : undefined}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <InquiryForm whatsapp={store?.whatsapp ?? ""} />
      </div>
    </section>
  );
}
