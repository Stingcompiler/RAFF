import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

// Locale comes from the route when a page sets it (marketing /ar, /en),
// otherwise from the user's cookie, otherwise Arabic.
export default getRequestConfig(async ({ requestLocale }) => {
  const fromRoute = await requestLocale;
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromRoute)
    ? fromRoute
    : isLocale(fromCookie)
      ? fromCookie
      : defaultLocale;
  return {
    locale,
    messages: (await import(`../../../messages/${locale}.json`)).default,
  };
});
