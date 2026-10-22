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
