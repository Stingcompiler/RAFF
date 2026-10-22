/**
 * Exact arithmetic on the API's decimal strings for display only (change due,
 * credit left). No rounding happens here: the server owns every persisted value.
 */

const SCALE = 4;
const FACTOR = 10n ** BigInt(SCALE);

export function toUnits(value: string | number | null | undefined): bigint {
  const text = String(value ?? "0").trim() || "0";
  const negative = text.startsWith("-");
  const [whole = "0", frac = ""] = text.replace(/^[-+]/, "").split(".");
  const digits = BigInt((whole || "0") + frac.padEnd(SCALE, "0").slice(0, SCALE));
  return negative ? -digits : digits;
}

export function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / FACTOR;
  const frac = (abs % FACTOR).toString().padStart(SCALE, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function subtract(a: string | number, ...rest: (string | number)[]): string {
  return fromUnits(rest.reduce<bigint>((acc, v) => acc - toUnits(v), toUnits(a)));
}

export function isNegative(value: string): boolean {
  return toUnits(value) < 0n;
}

/** Keep only what a money input may hold: digits and one decimal point. */
export function cleanAmount(text: string): string {
  const [whole = "", ...rest] = text.replace(/[^\d.]/g, "").split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, SCALE)}` : whole;
}

export function multiply(value: string | number, quantity: number): string {
  return fromUnits(toUnits(value) * BigInt(quantity));
}

export function sum(values: (string | number)[]): string {
  return fromUnits(values.reduce<bigint>((acc, v) => acc + toUnits(v), 0n));
}
