import { expect, test } from "@playwright/test";

import { DEMO_PASSWORD } from "../../../playwright.config";
import { registerCounter, signIn } from "../support/auth";

test.describe("sign-in", () => {
  test("workspace redirects to sign-in when signed out", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "متابعة" })).toBeDisabled();
  });

  test("wrong password shows a readable error and keeps the form", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("اسم المستخدم").fill("salma");
    await page.getByLabel("كلمة المرور").fill("not-the-password");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText(
      "✕ اسم المستخدم أو كلمة المرور غير صحيحة.",
    );
    await expect(page.getByLabel("اسم المستخدم")).toHaveValue("salma");
  });

  test("cashier signs in, keeps the registered counter and lands at the point of sale", async ({
    page,
  }) => {
    await registerCounter(page);
    await page.goto("/login");
    await expect(page.getByText("الجهاز مسجَّل باسم: كاونتر 1 — الخرطوم")).toBeVisible();
    await page.getByLabel("اسم المستخدم").fill("salma");
    await page.getByLabel("كلمة المرور").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page.getByLabel("الفرع")).toHaveValue(/.+/);
    await expect(page.getByLabel("الفرع").locator("option:checked")).toHaveText(
      "فرع الخرطوم (تجريبي)",
    );
    await expect(page.getByLabel("الكاونتر").locator("option:checked")).toHaveText("كاونتر 1");
    await page.getByRole("button", { name: "متابعة" }).click();
    await expect(page).toHaveURL(/\/pos$/);
    await expect(page.getByRole("banner")).toContainText("فرع الخرطوم (تجريبي)");
    await expect(page.getByRole("banner")).toContainText("كاونتر 1");
    await expect(page.getByRole("banner")).toContainText("سلمى (كاشير)");
  });

  test("owner with two branches chooses one", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("اسم المستخدم").fill("admin");
    await page.getByLabel("كلمة المرور").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "دخول" }).click();
    await page.getByLabel("الفرع").selectOption({ label: "فرع أم درمان (تجريبي)" });
    await page.getByRole("button", { name: "متابعة" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("banner")).toContainText("فرع أم درمان (تجريبي)");
  });

  test("sign-out ends the session", async ({ page }) => {
    await signIn(page, "salma");
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "قائمة المستخدم" }).click();
    await page.getByRole("menuitem", { name: "تسجيل الخروج" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    expect((await page.request.get("/api/v1/auth/me/")).status()).toBe(403);
  });
});

test.describe("users & roles", () => {
  test("owner creates a user who can then sign in", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/settings");
    await page.getByRole("button", { name: "مستخدم جديد" }).click();
    const dialog = page.getByRole("dialog");
    const username = `user${Date.now() % 100000}`;
    await dialog.getByLabel("اسم المستخدم").fill(username);
    await dialog.getByLabel("كلمة المرور").fill("counter-pass-55");
    await dialog.getByLabel("الاسم بالعربية").fill(`نهى ${username}`);
    await dialog.getByLabel("الاسم بالإنجليزية").fill("Noha");
    await dialog.getByLabel("الدور").selectOption({ label: "كاشير" });
    await dialog.getByLabel("الفرع").selectOption({ label: "فرع الخرطوم (تجريبي)" });
    await dialog.getByRole("button", { name: "إنشاء" }).click();
    await expect(page.getByRole("status").filter({ hasText: "تم إنشاء المستخدم" })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(`نهى ${username}`) })).toContainText(
      "كاشير",
    );

    await page.context().clearCookies();
    await signIn(page, username, "counter-pass-55");
    await page.goto("/settings");
    await expect(page.getByText("لا صلاحية لك في إدارة المستخدمين.")).toBeVisible();
  });
});
