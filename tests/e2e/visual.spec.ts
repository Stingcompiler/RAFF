// Screens compared against design/handoff/reference/ (CLAUDE.md rule 23, 2% tolerance).
import { test } from "@playwright/test";

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
