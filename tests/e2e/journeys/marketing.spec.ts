import { expect, test } from "@playwright/test";

const OPEN = "افتح رَفّ";

test.describe("Raff product page", () => {
  test("the way into Raff repeats through the page, each time with the same words", async ({
    page,
  }) => {
    await page.goto("/ar");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "أدِر صيدليتك كلها من شاشة واحدة",
    );
    const buttons = page.getByRole("link", { name: OPEN, exact: true });
    expect(await buttons.count()).toBeGreaterThanOrEqual(5);
    for (const href of await buttons.evaluateAll((els) => els.map((e) => e.getAttribute("href"))))
      expect(href).toBe("/login");
    await expect(page.getByRole("link", { name: "شاهد المتجر التجريبي" }).first()).toHaveAttribute(
      "href",
      "/shop",
    );
  });

  test("the button reaches the sign-in", async ({ page }) => {
    await page.goto("/ar");
    await page.getByRole("link", { name: OPEN, exact: true }).first().click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("on a phone: a navbar with a menu, and a button that follows the reader", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ar");
    const menu = page.getByRole("button", { name: "القائمة" });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    const panel = page.locator("#marketing-menu");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link", { name: "المزايا" })).toBeVisible();
    await expect(panel.getByRole("link", { name: OPEN, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    const bar = page.getByTestId("sticky-open");
    await expect(bar).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect(bar).toBeVisible();
    await expect(bar.getByRole("link", { name: OPEN, exact: true })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  test("the English page has the same button", async ({ page }) => {
    await page.goto("/en");
    expect(
      await page.getByRole("link", { name: "Open Raff", exact: true }).count(),
    ).toBeGreaterThanOrEqual(5);
  });

  test("the shop stays reachable at /shop", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "دواؤك قريب، وصيدلي يراجع طلبك.",
    );
  });
});
