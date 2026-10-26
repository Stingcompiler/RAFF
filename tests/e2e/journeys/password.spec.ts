import { expect, type Page, test } from "@playwright/test";

import { DEMO_PASSWORD } from "../../../playwright.config";
import { signIn } from "../support/auth";

const csrf = async (page: Page) =>
  (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";

/** A throwaway cashier, so no journey that signs in as a seeded user is affected. */
async function createUser(page: Page, username: string, name: string) {
  const roles = await (await page.request.get("/api/v1/roles/")).json();
  const cashier = roles.find((r: { code: string }) => r.code === "cashier");
  const res = await page.request.post("/api/v1/users/", {
    data: {
      username,
      password: DEMO_PASSWORD,
      display_name_ar: name,
      display_name_en: name,
      assignments: [{ role_id: cashier.id, branch_id: null }],
    },
    headers: { "x-csrftoken": await csrf(page) },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

async function canSignIn(page: Page, username: string, password: string) {
  const fresh = await page.context().browser()!.newContext({ baseURL: page.url() });
  try {
    const api = fresh.request;
    await api.get("/api/v1/auth/csrf/");
    const token = (await fresh.cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
    const res = await api.post("/api/v1/auth/login/", {
      data: { username, password },
      headers: { "x-csrftoken": token },
    });
    return res.ok();
  } finally {
    await fresh.close();
  }
}

test.describe("passwords", () => {
  test("the owner resets a user's password and the user changes it", async ({ page, baseURL }) => {
    const username = `reset${Date.now() % 100000}`;
    const name = `هبة ${username}`;
    await signIn(page, "admin");
    await createUser(page, username, name);

    await page.goto("/settings");
    const row = page.getByRole("row", { name: new RegExp(name) });
    await row.getByRole("button", { name: "إعادة تعيين كلمة المرور" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(`إعادة تعيين كلمة مرور ${name}`);
    await dialog.getByRole("button", { name: "إعادة التعيين" }).click();
    const temporary = ((await dialog.getByTestId("temp-password").textContent()) ?? "").trim();
    expect(temporary).toMatch(/^[A-Za-z0-9]{14}$/);
    await dialog.getByRole("button", { name: "تم" }).click();
    await expect(dialog).toBeHidden();

    // The old password is dead; the temporary one works.
    await page.goto(baseURL!);
    expect(await canSignIn(page, username, DEMO_PASSWORD)).toBe(false);
    expect(await canSignIn(page, username, temporary)).toBe(true);

    // The user signs in and picks their own.
    await page.context().clearCookies();
    await signIn(page, username, temporary);
    await page.goto("/account/password");
    await expect(page.getByRole("heading", { name: "تغيير كلمة المرور" })).toBeVisible();
    const form = page.locator("form");
    await form.getByLabel("كلمة المرور الحالية").fill("not-my-password");
    await form.getByLabel(/^كلمة المرور الجديدة/).fill("my-own-pass-2026");
    await form.getByLabel("تأكيد كلمة المرور الجديدة").fill("my-own-pass-2026");
    await form.getByRole("button", { name: "تغيير كلمة المرور" }).click();
    await expect(form).toContainText("كلمة المرور الحالية غير صحيحة");

    await form.getByLabel("كلمة المرور الحالية").fill(temporary);
    await form.getByLabel(/^كلمة المرور الجديدة/).fill("my-own-pass-2026");
    await form.getByLabel("تأكيد كلمة المرور الجديدة").fill("my-own-pass-2026");
    await form.getByRole("button", { name: "تغيير كلمة المرور" }).click();
    await expect(page.getByRole("status").filter({ hasText: "تغيّرت كلمة المرور" })).toBeVisible();
    expect(await canSignIn(page, username, temporary)).toBe(false);
    expect(await canSignIn(page, username, "my-own-pass-2026")).toBe(true);
  });

  test("a mismatch is caught before anything is sent, and the menu leads to the page", async ({
    page,
  }) => {
    const username = `menu${Date.now() % 100000}`;
    await signIn(page, "admin");
    await createUser(page, username, `سلمى ${username}`);
    await page.context().clearCookies();
    await signIn(page, username, DEMO_PASSWORD);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "قائمة المستخدم" }).click();
    await page.getByRole("menuitem", { name: "تغيير كلمة المرور" }).click();
    await expect(page).toHaveURL(/\/account\/password$/);
    const form = page.locator("form");
    await form.getByLabel("كلمة المرور الحالية").fill(DEMO_PASSWORD);
    await form.getByLabel(/^كلمة المرور الجديدة/).fill("another-pass-2026");
    await form.getByLabel("تأكيد كلمة المرور الجديدة").fill("different-pass-2026");
    await form.getByRole("button", { name: "تغيير كلمة المرور" }).click();
    await expect(form).toContainText("كلمتا المرور غير متطابقتين");
  });

  test("a cashier has no reset button: it lives in Settings for users managers only", async ({
    page,
  }) => {
    await signIn(page, "salma");
    await page.goto("/settings");
    await expect(page.getByRole("button", { name: "إعادة تعيين كلمة المرور" })).toHaveCount(0);
  });
});
