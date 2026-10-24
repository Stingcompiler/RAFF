import "@fontsource/ibm-plex-sans-arabic/arabic-400.css";
import "@fontsource/ibm-plex-sans-arabic/latin-400.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-500.css";
import "@fontsource/ibm-plex-sans-arabic/latin-500.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-600.css";
import "@fontsource/ibm-plex-sans-arabic/latin-600.css";
import "@fontsource/ibm-plex-sans-arabic/arabic-700.css";
import "@fontsource/ibm-plex-sans-arabic/latin-700.css";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
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
