import { expect, test } from "@playwright/test";

import { signIn } from "../support/auth";

test.describe.configure({ mode: "serial" });

const PHONE = "0911111111";

test.describe("contact page", () => {
  test("a direct WhatsApp button, and a question form that reaches the staff once", async ({
    page,
  }) => {
    await page.goto("/contact");
    await expect(page.getByRole("link", { name: "ابدأ محادثة على واتساب" })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/\d+\?text=.+/,
    );

    const send = page.getByRole("button", { name: "إرسال الاستفسار" });
    await expect(send).toBeDisabled();
    await page.getByLabel("الاسم").fill("نجلاء حسن");
    await page.getByLabel("رقم الهاتف").fill("123");
    await expect(page.getByText("✕ أدخل رقماً سودانياً صحيحاً مثل 0912345678")).toBeVisible();
    await page.getByLabel("رقم الهاتف").fill(PHONE);
    await expect(page.getByLabel("رقم الطلب")).toHaveCount(0);
    await page.getByLabel("موضوع الاستفسار").selectOption("order");
    await expect(page.getByLabel("رقم الطلب")).toBeVisible();
    await expect(send).toBeDisabled();
    await page.getByLabel("رقم الطلب").fill("O-0001");
    await page.getByLabel("اتصال هاتفي").check();
    await page.getByLabel("استفسارك").fill("متى يجهز طلبي؟");
    await expect(send).toBeDisabled(); // consent first
    await page.getByRole("checkbox").check();
    await send.dblclick();

    await expect(page.getByText("وصل استفسارك")).toBeVisible();
    await expect(page.getByText(/رقم استفسارك Q-\d{4}/)).toBeVisible();
    await expect(page.getByText("سنتواصل معك عبر اتصال هاتفي")).toBeVisible();
    await expect(page.getByRole("link", { name: "أرسل نسخة على واتساب" })).toHaveAttribute(
      "href",
      /wa\.me\/\d+\?text=.*Q-\d{4}/,
    );
  });

  test("staff see the question once, reply on WhatsApp and mark it answered", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/orders");
    await page.getByRole("link", { name: "الاستفسارات" }).click();
    await expect(page).toHaveURL(/\/orders\/inquiries$/);
    const card = page.getByRole("article").filter({ hasText: PHONE });
    await expect(card).toHaveCount(1); // the double click made one
    await expect(card).toContainText("نجلاء حسن");
    await expect(card).toContainText("O-0001");
    await expect(card).toContainText("متى يجهز طلبي؟");
    await expect(card.getByRole("link", { name: "رد على واتساب" })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/249911111111\?text=.+/,
    );
    await card.getByRole("button", { name: "تم الرد" }).click();
    await expect(card).toContainText("تم الرد");
    await expect(card.getByRole("button", { name: "تم الرد" })).toHaveCount(0);
  });
});
