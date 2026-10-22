import { expect, test } from "@playwright/test";

import { signIn } from "../support/auth";

test.describe("app shell", () => {
  test("marketing landing follows the URL locale and direction", async ({ page }) => {
    await page.goto("/ar");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("رَفّ");

    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Raff");
  });

  test("unknown locale is a 404", async ({ page }) => {
    const response = await page.goto("/fr");
    expect(response?.status()).toBe(404);
  });

  test("storefront and workspace render in Arabic by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("رَفّ");
    await signIn(page, "salma");
    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("نظرة عامة");
  });

  test("user locale and theme come from cookies", async ({ page, context, baseURL }) => {
    await signIn(page, "salma");
    await context.addCookies([
      { name: "NEXT_LOCALE", value: "en", url: baseURL! },
      { name: "raff-theme", value: "dark", url: baseURL! },
    ]);
    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
  });

  test("fonts are self-hosted, nothing loads from Google", async ({ page, baseURL }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith(baseURL!)) external.push(r.url());
    });
    await page.goto("/ar");
    await page.evaluate(() => document.fonts.ready);
    const families = await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family),
    );
    expect(families.join(",")).toContain("IBM Plex Sans Arabic");
    expect(external).toEqual([]);
  });

  test("API health is reachable through the frontend origin", async ({ request }) => {
    const response = await request.get("/api/v1/health/");
    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
  });
});
