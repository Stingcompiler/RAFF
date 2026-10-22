/**
 * Display formatting only — never used to compute values that are persisted
 * (CLAUDE.md rule 10: the server computes totals and rounds).
 */

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** "12500.0000" → "12,500". Western digits in both locales. */
export function amount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return grouped.format(Number(value));
}

/** Currency after the number in Arabic (ج.س), before it in English (SDG). */
export function money(value: string | number | null | undefined, locale: string): string {
  const n = amount(value);
  if (!n) return "";
  return locale === "ar" ? `${n} ج.س` : `SDG ${n}`;
}

/** Business time zone (backend TIME_ZONE); times shown at the counter use it on server and browser alike. */
const BUSINESS_TZ = "Africa/Khartoum";
const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: BUSINESS_TZ,
});

/** ISO timestamp → "HH:MM" in the business time zone. */
export function timeOfDay(iso: string | null | undefined): string {
  return iso ? clock.format(new Date(iso)) : "";
}
