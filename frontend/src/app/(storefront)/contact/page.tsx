import { getLocale, getTranslations } from "next-intl/server";

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
    <section className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-[28px] px-[20px] py-[32px]">
      <div className="grid content-start gap-[16px]">
        <h1 className="m-0 text-[32px] font-semibold">{t("nav.contact")}</h1>
        <dl className="m-0 grid border-t border-border">
          {rows.map(([label, value, ltr]) => (
            <div
              key={label}
              className="flex min-h-[52px] items-center justify-between gap-[12px] border-b border-border"
            >
              <dt className="text-text-muted">{label}</dt>
              <dd className="m-0" dir={ltr ? "ltr" : undefined}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {store?.whatsapp && (
          <a
            href={waLink(store.whatsapp)}
            className="inline-flex min-h-[52px] items-center justify-center rounded-[12px] bg-brand font-semibold text-on-brand no-underline"
          >
            {t("waLong")}
          </a>
        )}
      </div>
      <div className="grid h-[300px] place-items-center rounded-[16px] bg-surface-subtle text-text-muted">
        {t("imgPh")}
      </div>
    </section>
  );
}
