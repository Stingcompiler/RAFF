import "@/styles/fonts.css";
import "@/app/globals.css";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import { directionOf, type Locale } from "@/lib/i18n/config";
import type { Density } from "@/lib/density/cookie";
import type { Theme } from "@/lib/theme/config";

type Props = { locale: Locale; theme: Theme; density?: Density | null; children: ReactNode };

/** The <html> shell shared by every route group's root layout. */
export function RootDocument({ locale, theme, density, children }: Props) {
  return (
    <html
      lang={locale}
      dir={directionOf(locale)}
      data-theme={theme}
      data-density={density ?? undefined}
    >
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
