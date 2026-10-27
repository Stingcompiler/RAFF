import { getLocale } from "next-intl/server";

import type { Store } from "@/features/store/types";
import { serverGet } from "@/lib/api/server";
import pwa from "@/lib/pwa.json";
import { shopHome } from "@/lib/root";

export const dynamic = "force-dynamic";

/** The shop as an installable app: the pharmacy's own name and colour, opening on its home page. */
export async function GET() {
  const [locale, store] = await Promise.all([
    getLocale(),
    serverGet<Store>("/public/store/").catch(() => null),
  ]);
  const ar = locale === "ar";
  const name = (ar ? store?.name_ar : store?.name_en) || store?.name_ar || store?.name_en || "رَفّ";
  const body = {
    id: "/",
    name,
    short_name: name.slice(0, 12),
    lang: locale,
    dir: ar ? "rtl" : "ltr",
    start_url: shopHome(),
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: store?.brand_color || pwa.theme,
    background_color: pwa.background,
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/manifest+json", "cache-control": "no-cache" },
  });
}
