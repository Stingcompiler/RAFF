import { getTranslations } from "next-intl/server";

/** What the app shows when the connection is gone (kept by the service worker). */
export default async function OfflinePage() {
  const t = await getTranslations("store");
  return (
    <section className="mx-auto grid max-w-[480px] justify-items-center gap-[12px] px-[20px] py-[72px] text-center">
      <h1 className="m-0 text-land-section font-semibold">{t("offlineT")}</h1>
      <p className="m-0 text-text-secondary">{t("offlineB")}</p>
    </section>
  );
}
