import { twMerge } from "tailwind-merge";

type ClassValue = string | false | null | undefined;

/** Join class names; later Tailwind utilities override earlier conflicting ones. */
export function cn(...classes: ClassValue[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
