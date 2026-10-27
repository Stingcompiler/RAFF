import { expect, test } from "@playwright/test";

import { signIn } from "../support/auth";

test.describe.configure({ mode: "serial" });

const REF = "TX778899";
const LATER_PHONE = "0966666662";

async function toCheckout(page: import("@playwright/test").Page, query = "باراسيتامول") {
  await page.goto(`/store?q=${encodeURIComponent(query)}`);
  await page
    .getByRole("article")
    .filter({ hasText: query })
    .getByRole("button", { name: "أضف إلى السلة" })
    .click();
  await page.goto("/checkout");
}

async function fillContact(page: import("@playwright/test").Page, phone: string) {
  await page.getByLabel("الاسم").fill("هالة عمر");
  await page.getByLabel("رقم الهاتف").fill(phone);
  await page.getByLabel("موقعك").fill("أمدرمان — الثورة الحارة 12");
}

test.describe("bank transfer before pickup, and delivery to the home", () => {
  test("the pharmacy turns the options on in the store settings", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/storefront/settings");
    await page.getByRole("switch", { name: "السماح بالدفع المسبق بتحويل بنكي" }).click();
    await page.getByRole("switch", { name: "السماح بخيار التوصيل إلى البيت" }).click();
    await page.getByRole("button", { name: "حفظ" }).click();
    // Prepayment needs an account to show before it can be saved.
    await expect(page.getByText("أضف حساباً بنكياً قبل تفعيل الدفع المسبق")).toBeVisible();
    await page
      .getByLabel("حسابات الاستلام (تظهر للزبون)")
      .fill("بنك الخرطوم — 1234567 — صيدلية الشفاء");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("حُفظ").first()).toBeVisible();
  });

  test("a guest sends the order with the transfer, and staff verify it", async ({
    browser,
    baseURL,
    page,
  }) => {
    const guest = await (await browser.newContext({ baseURL })).newPage();
    await toCheckout(guest);
    await expect(guest.getByText("استلام من الصيدلية").first()).toBeVisible();
    await expect(guest.getByText("توصيل إلى البيت")).toBeVisible();
    await guest.getByLabel("تحويل بنكي قبل الاستلام").check();
    await expect(guest.getByText("بنك الخرطوم — 1234567 — صيدلية الشفاء")).toBeVisible();
    await fillContact(guest, "0966666661");
    await guest.getByRole("checkbox").check();
    const send = guest.getByRole("button", { name: "إرسال الطلب" });
    await expect(send).toBeDisabled(); // the transaction number is required
    await guest.getByLabel("رقم العملية البنكية").fill("12");
    await expect(guest.getByText("✕ أدخل رقم العملية (4 أحرف على الأقل)")).toBeVisible();
    await guest.getByLabel("رقم العملية البنكية").fill(REF);
    await expect(guest.getByLabel("المبلغ المحوَّل")).toHaveValue("800");
    await send.click();
    await expect(guest).toHaveURL(/\/orders\/[A-Za-z0-9_-]{40,}$/);
    await expect(guest.getByTestId("payment-status")).toHaveText(
      "وصلت بيانات تحويلك وهي قيد التحقق",
    );
    await guest.context().close();

    await signIn(page, "admin");
    await page.goto("/orders");
    await page
      .getByRole("table", { name: "الطلبات" })
      .getByRole("row", { name: /0966666661/ })
      .click();
    await expect(page.getByTestId("pay-ref")).toHaveText(REF);
    await page.getByRole("button", { name: "تأكيد الطلب" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("● مؤكد").first()).toBeVisible();
    // Preparing before verification is a recorded decision, not a click.
    await page.getByRole("button", { name: "بدء التجهيز" }).click();
    await expect(page.getByText("التحويل لم يُتحقَّق منه بعد")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "تأكيد" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "تحقّقتُ من التحويل" }).click();
    await expect(page.getByText("تم التحقق").first()).toBeVisible();
    await page.getByRole("button", { name: "بدء التجهيز" }).click();
    await expect(page.getByText("التحويل لم يُتحقَّق منه بعد")).toHaveCount(0);
    await page.getByRole("dialog").getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("■ قيد التجهيز").first()).toBeVisible();
  });

  test("a guest who has not transferred yet sends the details from the order page", async ({
    browser,
    baseURL,
    page,
  }) => {
    const guest = await (await browser.newContext({ baseURL })).newPage();
    await toCheckout(guest);
    await guest.getByLabel("تحويل بنكي قبل الاستلام").check();
    await guest.getByLabel("سأحوّل بعد تأكيد الصيدلية").check();
    await fillContact(guest, LATER_PHONE);
    await guest.getByRole("checkbox").check();
    await guest.getByRole("button", { name: "إرسال الطلب" }).click();
    await expect(guest.getByTestId("payment-status")).toHaveText("بانتظار بيانات التحويل منك");
    await guest.getByLabel("رقم العملية البنكية").fill(REF);
    await guest.getByRole("button", { name: "إرسال بيانات التحويل" }).click();
    await expect(guest.getByText("✕ رقم العملية هذا مستخدم لطلب آخر")).toBeVisible();
    await guest.getByLabel("رقم العملية البنكية").fill("TX990011");
    await guest.getByRole("button", { name: "إرسال بيانات التحويل" }).click();
    await expect(guest.getByTestId("payment-status")).toHaveText(
      "وصلت بيانات تحويلك وهي قيد التحقق",
    );
    await guest.context().close();

    await signIn(page, "admin");
    await page.goto("/orders");
    await page
      .getByRole("table", { name: "الطلبات" })
      .getByRole("row", { name: new RegExp(LATER_PHONE) })
      .click();
    await page.getByRole("button", { name: "رفض التحويل" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "تأكيد" })).toBeDisabled();
    await dialog.getByLabel("سبب الرفض (يراه الزبون)").fill("المبلغ لم يصل");
    await dialog.getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("مرفوض").first()).toBeVisible();
  });

  test("delivery is offered, and prescription items are pickup and pay-at-pickup only", async ({
    browser,
    baseURL,
    page,
  }) => {
    const guest = await (await browser.newContext({ baseURL })).newPage();
    await toCheckout(guest);
    await guest.getByLabel("توصيل إلى البيت").check();
    await fillContact(guest, "0966666663");
    await guest.getByRole("checkbox").check();
    await guest.getByRole("button", { name: "إرسال الطلب" }).click();
    await expect(guest.getByText("توصيل إلى البيت").first()).toBeVisible();

    await guest.goto("/store?q=أموكسيسيلين");
    await guest.getByRole("link", { name: "اطلب مراجعة الصيدلي" }).first().click();
    await expect(guest.getByLabel("توصيل إلى البيت")).toBeDisabled();
    await expect(guest.getByLabel("تحويل بنكي قبل الاستلام")).toBeDisabled();
    await expect(guest.getByLabel("استلام من الصيدلية")).toBeChecked();
    await guest.context().close();

    await signIn(page, "admin");
    await page.goto("/orders");
    await page
      .getByRole("table", { name: "الطلبات" })
      .getByRole("row", { name: /0966666663/ })
      .click();
    await expect(page.getByText("توصيل إلى البيت").first()).toBeVisible();
  });

  test.afterAll(async ({ browser, baseURL }) => {
    const page = await (await browser.newContext({ baseURL })).newPage();
    await signIn(page, "admin");
    await page.goto("/storefront/settings");
    await page.getByRole("switch", { name: "السماح بالدفع المسبق بتحويل بنكي" }).click();
    await page.getByRole("switch", { name: "السماح بخيار التوصيل إلى البيت" }).click();
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("حُفظ").first()).toBeVisible();
    await page.context().close();
  });
});
