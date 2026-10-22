// Screens compared against design/handoff/reference/ (CLAUDE.md rule 23, 2% tolerance).
import { test } from "@playwright/test";

import { DEMO_PASSWORD } from "../../playwright.config";
import { registerCounter } from "./support/auth";
import { expectMatchesReference } from "./support/reference";

const VARIANTS = [
  { locale: "ar", theme: "light" },
  { locale: "en", theme: "light" },
] as const;

test.describe("Raff Components → /dev/components", () => {
  for (const { locale, theme } of VARIANTS) {
    test(`${locale}-${theme}-1440`, async ({ page, context, baseURL }, testInfo) => {
      await context.addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/dev/components");
      await expectMatchesReference(page, testInfo, {
        file: "raff-components",
        state: "default",
        locale,
        theme,
        width: 1440,
      });
    });
  }
});

// The shell is compared region by region: sidebar (257px incl. padding + border)
// and top bar (53px incl. border). Screen content arrives with later work orders.
test.describe("Workspace shell → /dev/shell (Raff Screens)", () => {
  const SIDEBAR = 257;
  const TOPBAR = 53;
  const HEIGHT = 860;
  for (const { locale, theme } of [
    { locale: "ar", theme: "light" },
    { locale: "en", theme: "dark" },
  ] as const) {
    test(`${locale}-${theme}-1440`, async ({ page, context, baseURL }, testInfo) => {
      await context.addCookies([
        { name: "NEXT_LOCALE", value: locale, url: baseURL! },
        { name: "raff-theme", value: theme, url: baseURL! },
      ]);
      await page.setViewportSize({ width: 1440, height: HEIGHT });
      await page.goto("/dev/shell");
      const rtl = locale === "ar";
      const sideX = rtl ? 1440 - SIDEBAR : 0;
      const barX = rtl ? 0 : SIDEBAR;
      await expectMatchesReference(
        page,
        testInfo,
        { file: "raff-screens", state: "dashboard", locale, theme, width: 1440 },
        {
          fullPage: false,
          regions: [
            { x: sideX, y: 0, width: SIDEBAR, height: HEIGHT },
            { x: barX, y: 0, width: 1440 - SIDEBAR, height: TOPBAR },
          ],
        },
      );
    });
  }
});

test.describe("Sign-in → /login (Raff Screens › الدخول)", () => {
  // Both variants register the same counter; registering rotates its token.
  test.describe.configure({ mode: "serial" });
  for (const { locale, theme } of [
    { locale: "ar", theme: "light" },
    { locale: "en", theme: "dark" },
  ] as const) {
    test(`${locale}-${theme}-1440`, async ({ page, context, baseURL }, testInfo) => {
      await registerCounter(page);
      await context.addCookies([
        { name: "NEXT_LOCALE", value: locale, url: baseURL! },
        { name: "raff-theme", value: theme, url: baseURL! },
      ]);
      await page.setViewportSize({ width: 1440, height: 860 });
      await page.goto("/login");
      await page.locator("input[name=username]").fill("salma");
      await page.locator("input[name=password]").fill(DEMO_PASSWORD);
      await page.locator("form button[type=submit]").first().click();
      await page.locator("select[name=counter]:not([disabled])").waitFor();
      await page.mouse.move(0, 0);
      await expectMatchesReference(
        page,
        testInfo,
        { file: "raff-screens", state: "login", locale, theme, width: 1440 },
        { fullPage: false, regions: [{ x: 0, y: 0, width: 1440, height: 860 }] },
      );
    });
  }
});
