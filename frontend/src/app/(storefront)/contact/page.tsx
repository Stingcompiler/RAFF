import { Clock, MapPin, MessageCircle, Phone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { InquiryForm } from "@/features/store/InquiryForm";
import { type Store, waLink } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";

const PLUS = "+";

/** Contact (D-R0025): the quick channel and the pharmacy's details beside the question form on
 * a wide screen, one column on a phone with WhatsApp first. */
export default async function ContactPage() {
  const t = await getTranslations("store");
  const ar = (await getLocale()) === "ar";
  const store = await serverGet<Store>("/public/store/");
  const address = store ? (ar ? store.address_ar : store.address_en) : "";
  const phone = store?.whatsapp ?? "";
  const rows = [
    { icon: MapPin, label: t("addrL"), value: address, ltr: false, href: "" },
    { icon: Clock, label: t("hoursL"), value: store?.hours ?? "", ltr: true, href: "" },
    {
      icon: Phone,
      label: t("waL"),
      value: phone ? `${PLUS}${phone}` : "",
      ltr: true,
      href: phone ? `tel:${PLUS}${phone}` : "",
    },
  ].filter((r) => r.value);

  return (
    <section className="px-[20px] pt-[32px] pb-[56px] max-[760px]:pt-[20px]">
      <header className="mb-[24px] grid max-w-[640px] gap-[8px]">
        <h1 className="m-0 text-land-section font-semibold">{t("nav.contact")}</h1>
        <p className="m-0 text-land-lead text-text-secondary">{t("contactLead")}</p>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-[24px] min-[900px]:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <aside className="grid gap-[16px] min-[900px]:sticky min-[900px]:top-[96px]">
          {phone && (
            <div className="grid gap-[12px] rounded-panel bg-brand p-[20px] text-on-brand">
              <div className="flex items-center gap-[10px] text-land-lead font-semibold">
                <MessageCircle size={24} aria-hidden="true" />
                {t("waCardT")}
              </div>
              <p className="m-0 opacity-90">{t("waCardB")}</p>
              <a
                href={waLink(phone, t("waGreeting"))}
                className="inline-flex min-h-[48px] items-center justify-center gap-[8px] rounded-card bg-surface px-[18px] font-semibold text-brand no-underline"
              >
                {t("waDirect")}
              </a>
            </div>
          )}
          {rows.length > 0 && (
            <dl className="m-0 grid gap-[4px] rounded-panel border border-border bg-surface p-[8px]">
              {rows.map(({ icon: Icon, label, value, ltr, href }) => (
                <div key={label} className="flex items-start gap-[12px] rounded-card p-[10px]">
                  <span
                    aria-hidden="true"
                    className="grid size-[40px] flex-none place-items-center rounded-full bg-brand-subtle text-brand"
                  >
                    <Icon size={20} />
                  </span>
                  <div className="grid min-w-0 gap-[2px]">
                    <dt className="text-label text-text-muted">{label}</dt>
                    <dd className="m-0 font-semibold">
                      {href ? (
                        <a
                          href={href}
                          dir="ltr"
                          className="inline-flex min-h-[44px] items-center text-text no-underline num"
                        >
                          {value}
                        </a>
                      ) : (
                        <span dir={ltr ? "ltr" : undefined} className={ltr ? "num" : undefined}>
                          {value}
                        </span>
                      )}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          )}
        </aside>
        <InquiryForm whatsapp={phone} />
      </div>
    </section>
  );
}
