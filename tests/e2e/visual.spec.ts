// Proves the visual comparison path works end to end (WO-00). Real screens are
// compared against design/handoff/reference/ from WO-01 onwards.
import { expect, test } from "@playwright/test";

test("storefront placeholder matches its reference (ar, light, 1440)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("storefront-placeholder-ar-light-1440.png", {
    fullPage: true,
  });
});
