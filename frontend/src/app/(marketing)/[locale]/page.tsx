import { setRequestLocale } from "next-intl/server";

import { Placeholder } from "@/components/Placeholder";

type Props = { params: Promise<{ locale: string }> };

export default async function MarketingPage({ params }: Props) {
  setRequestLocale((await params).locale);
  return <Placeholder titleKey="app.name" />;
}
