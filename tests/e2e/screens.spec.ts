// One baseline per screen in the map of BUILD-SPEC §4.4, in the four variants of rule 23:
// ar-light and en-dark, at 1440 and 390 (the phone layout). Baselines are written only by the
// "Visual baselines (Linux)" workflow; a change is reviewed as an image diff.
import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./support/auth";

const VARIANTS = [
  { locale: "ar", theme: "light" },
  { locale: "en", theme: "dark" },
] as const;
const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

// The clock the pages see, so "Updated 08:00" and the POS clock are the same on every run.
const NOW = new Date("2026-10-22T08:00:00Z");

const WORKSPACE = [
  ["dashboard", "/dashboard"],
  ["inventory", "/inventory"],
  ["purchases", "/purchases"],
  ["returns", "/returns"],
  ["parties", "/parties"],
  ["transfers", "/transfers"],
  ["reports", "/reports"],
  ["settings", "/settings"],
] as const;
const PUBLIC = [
  ["store", "/store"],
  ["cart", "/cart"],
  ["checkout", "/checkout"],
  ["about", "/about"],
] as const;

async function prepare(
  page: Page,
  baseURL: string,
  { locale, theme }: (typeof VARIANTS)[number],
  size: (typeof SIZES)[number],
) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: locale, url: baseURL },
    { name: "raff-theme", value: theme, url: baseURL },
  ]);
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize(size);
}

async function shoot(page: Page, name: string, path: string, v: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(`${name}-${v}.png`);
}

for (const variant of VARIANTS) {
  for (const size of SIZES) {
    const v = `${variant.locale}-${variant.theme}-${size.width}`;

    test.describe(`Workspace screens · ${v}`, () => {
      test.beforeEach(async ({ page, baseURL }) => {
        await prepare(page, baseURL!, variant, size);
        await signIn(page, "admin");
      });
      for (const [name, path] of WORKSPACE) {
        test(name, async ({ page }) => shoot(page, name, path, v));
      }
    });

    test.describe(`Storefront screens · ${v}`, () => {
      test.beforeEach(async ({ page, baseURL }) => {
        await prepare(page, baseURL!, variant, size);
      });
      for (const [name, path] of PUBLIC) {
        test(name, async ({ page }) => shoot(page, `store-${name}`, path, v));
      }
    });
  }
}
