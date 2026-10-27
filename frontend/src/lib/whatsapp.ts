const SUDAN = "249";

/** Digits only, with Sudan's country code: 0912345678, 912345678, +249… and 00249… all become 249912345678. */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  if (digits.startsWith(SUDAN)) return digits;
  if (digits.startsWith("0")) return SUDAN + digits.slice(1);
  if (/^[19]\d{8}$/.test(digits)) return SUDAN + digits;
  return digits;
}

/** A wa.me chat link for a phone number, with an optional prefilled message. */
export const waLink = (phone: string, text = "") =>
  `https://wa.me/${whatsappNumber(phone)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
