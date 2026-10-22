import { setRequestLocale } from "next-intl/server";

import { Placeholder } from "@/components/Placeholder";

export default async function MarketingPage({ params }: PageProps<"/[locale]">) {
  setRequestLocale((await params).locale);
  return <Placeholder titleKey="app.name" />;
}
