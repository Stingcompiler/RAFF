import { getTranslations } from "next-intl/server";

import type messages from "../../messages/ar.json";

type Props = { titleKey: "app.name" | `nav.${keyof (typeof messages)["nav"]}` };

export async function Placeholder({ titleKey }: Props) {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-3 px-6">
      <h1 className="text-[26px] font-medium text-text">{t(titleKey)}</h1>
      <p className="text-text-muted">{t("placeholder.body")}</p>
    </main>
  );
}
