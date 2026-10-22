import { expect, test } from "@playwright/test";

test.describe("workspace shell", () => {
  test("sidebar navigates and marks the current screen", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation");
    await expect(nav.getByRole("link", { name: "المتابعة" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await nav.getByRole("link", { name: "المشتريات" }).click();
    await expect(page).toHaveURL(/\/purchases$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("المشتريات");
    await expect(nav.getByRole("link", { name: "المشتريات" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("user menu switches language and theme", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "قائمة المستخدم" }).click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await page.getByRole("button", { name: "User menu" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
  });

  test("server state comes from the API health check", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("status")).toContainText("متصل");
  });

  test("sidebar collapses to icons at 1180px", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation");
    expect((await nav.boundingBox())?.width).toBe(65);
    await expect(nav.getByText("المتابعة")).toBeHidden();
  });

  test("sidebar becomes a drawer at 760px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/dashboard");
    const link = page.getByRole("link", { name: "التقارير" });
    await expect(link).not.toBeInViewport();
    await page.getByRole("button", { name: "القائمة" }).click();
    await expect(link).toBeInViewport();
    await link.click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(link).not.toBeInViewport();
  });
});

test.describe("dialog", () => {
  test("traps focus, closes on Escape and returns focus to the opener", async ({ page }) => {
    await page.goto("/dev/dialog");
    const opener = page.getByRole("button", { name: "اعتماد الاستلام" });
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "رجوع" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "اعتماد" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "رجوع" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("approve is disabled while pending and shows no success", async ({ page }) => {
    await page.goto("/dev/dialog");
    await page.getByRole("button", { name: "اعتماد الاستلام" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "اعتماد" }).click();
    await expect(page.getByRole("button", { name: "جارٍ الاعتماد…" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
