import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@/app/globals.css";

import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import { directionOf, type Locale } from "@/lib/i18n/config";
import type { Theme } from "@/lib/theme/config";

type Props = { locale: Locale; theme: Theme; children: ReactNode };

/** The <html> shell shared by every route group's root layout. */
export function RootDocument({ locale, theme, children }: Props) {
  return (
    <html lang={locale} dir={directionOf(locale)} data-theme={theme}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
