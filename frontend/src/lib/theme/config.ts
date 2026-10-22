import { cookies } from "next/headers";

export const themes = ["light", "dark"] as const;
export type Theme = (typeof themes)[number];
export const THEME_COOKIE = "raff-theme";

export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return value === "dark" ? "dark" : "light";
}
