import { cookies } from "next/headers";

import { THEME_COOKIE } from "./cookie";

export { THEME_COOKIE };

export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];

export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === "dark" ? "dark" : "light";
}
