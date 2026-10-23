// Screens compared against Playwright baselines (CLAUDE.md rule 23, 2% tolerance).
// Baselines are written only by `make visual-update` (macOS, untracked) and by the
// "Visual baselines (Linux)" workflow (committed); a change is reviewed as an image diff.
import { expect, type Page, test } from "@playwright/test";

import { DEMO_PASSWORD } from "../../playwright.config";
import { registerCounter } from "./support/auth";

const VARIANTS = [
  { locale: "ar", theme: "light" },
  { locale: "en", theme: "dark" },
] as const;

async function setup(
  page: Page,
  context: import("@playwright/test").BrowserContext,
  baseURL: string,
  { locale, theme }: (typeof VARIANTS)[number],
  height: number,
) {
  await context.addCookies([
    { name: "NEXT_LOCALE", value: locale, url: baseURL },
    { name: "raff-theme", value: theme, url: baseURL },
  ]);
  await page.setViewportSize({ width: 1440, height });
}

const settle = (page: Page) => page.evaluate(() => document.fonts.ready);

test.describe("Components → /dev/components", () => {
  for (const variant of VARIANTS) {
    test(`${variant.locale}-${variant.theme}-1440`, async ({ page, context, baseURL }) => {
      await setup(page, context, baseURL!, variant, 900);
      await page.goto("/dev/components");
      await settle(page);
      await expect(page).toHaveScreenshot(
        `components-${variant.locale}-${variant.theme}-1440.png`,
        { fullPage: true },
      );
    });
  }
});

test.describe("Workspace shell → /dev/shell", () => {
  for (const variant of VARIANTS) {
    test(`${variant.locale}-${variant.theme}-1440`, async ({ page, context, baseURL }) => {
      await setup(page, context, baseURL!, variant, 860);
      await page.goto("/dev/shell");
      await settle(page);
      await expect(page).toHaveScreenshot(`shell-${variant.locale}-${variant.theme}-1440.png`);
    });
  }
});

test.describe("Sign-in → /login", () => {
  // Both variants register the same counter; registering rotates its token.
  test.describe.configure({ mode: "serial" });
  for (const variant of VARIANTS) {
    test(`${variant.locale}-${variant.theme}-1440`, async ({ page, context, baseURL }) => {
      await registerCounter(page);
      await setup(page, context, baseURL!, variant, 860);
      await page.goto("/login");
      await page.locator("input[name=username]").fill("salma");
      await page.locator("input[name=password]").fill(DEMO_PASSWORD);
      await page.locator("form button[type=submit]").first().click();
      await page.locator("select[name=counter]:not([disabled])").waitFor();
      await page.mouse.move(0, 0);
      await settle(page);
      await expect(page).toHaveScreenshot(`login-${variant.locale}-${variant.theme}-1440.png`);
    });
  }
});
