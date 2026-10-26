import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

export default async function PolicyPage({ params }: PageProps<"/policies/[slug]">) {
  const { slug } = await params;
  if (slug !== "privacy") notFound();
  const t = await getTranslations("store");
  const items = t.raw("policies") as { t: string; d: string }[];
  return (
    <section className="mx-auto grid max-w-[720px] gap-[20px] px-[20px] py-[40px]">
      <h1 className="m-0 text-land-section font-semibold">{t("policy")}</h1>
      {items.map((p) => (
        <div key={p.t} className="grid gap-[4px] border-t border-border pt-[14px]">
          <div className="text-land-lead font-semibold">{p.t}</div>
          <div className="leading-loose text-text-secondary">{p.d}</div>
        </div>
      ))}
      <div className="text-label text-warning-text">{t("polNote")}</div>
    </section>
  );
}
