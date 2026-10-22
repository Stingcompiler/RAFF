import { expect, test } from "@playwright/test";

import { signIn } from "../support/auth";

test.describe.configure({ mode: "serial" });

const PHONE = "0912345678";

test.describe("public storefront", () => {
  test("a guest finds an item, sends an order once and tracks it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "دواؤك قريب، وصيدلي يراجع طلبك.",
    );
    await expect(page.getByRole("heading", { name: "أصناف مختارة" })).toBeVisible();

    await page.getByRole("searchbox", { name: "ابحث عن دواء أو مستلزم" }).fill("باراسيتامول");
    await page.getByRole("searchbox", { name: "ابحث عن دواء أو مستلزم" }).press("Enter");
    await expect(page).toHaveURL(/\/store\?q=/);
    const card = page.getByRole("article").filter({ hasText: "باراسيتامول" });
    await expect(card).toContainText("800 ج.س");
    await expect(card).toContainText(/● متاح|▲ يحتاج تأكيد الصيدلية/);
    await expect(card).not.toContainText(/\d+ شريط \(/); // never a stock number
    await card.getByRole("button", { name: "أضف إلى السلة" }).click();
    await card.getByRole("button", { name: "أضف إلى السلة" }).click();
    await expect(page.getByTestId("cart-count")).toHaveText("2");

    await page.goto("/cart");
    await expect(page.getByTestId("store-cart-line")).toHaveCount(1);
    await expect(page.getByTestId("store-estimate")).toHaveText("1,600 ج.س");
    await page.getByRole("link", { name: "إرسال الطلب" }).click();

    await expect(page).toHaveURL(/\/checkout$/);
    const send = page.getByRole("button", { name: "إرسال الطلب" });
    await expect(send).toBeDisabled();
    await page.getByLabel("الاسم").fill("سلمى أحمد");
    await page.getByLabel("رقم الهاتف").fill("12345");
    await expect(page.getByText("✕ أدخل رقماً سودانياً صحيحاً مثل 0912345678")).toBeVisible();
    await page.getByLabel("رقم الهاتف").fill(PHONE);
    await page.getByRole("checkbox").check();
    await send.dblclick();

    await expect(page).toHaveURL(/\/orders\/[A-Za-z0-9_-]{40,}$/);
    await expect(page.getByText("وصل طلبك إلى الصيدلية")).toBeVisible();
    const number = (await page.getByTestId("order-number").textContent())?.trim() ?? "";
    expect(number).toMatch(/^O-\d{4}$/);
    const orderUrl = page.url();

    await page.goto("/orders/track");
    await page.getByLabel("رقم الطلب").fill(number);
    await page.getByLabel("رقم الهاتف").fill("0999999999");
    await page.getByRole("button", { name: "عرض الطلب" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("✕ لا يوجد طلب بهذه البيانات.");
    await page.getByLabel("رقم الهاتف").fill(PHONE);
    await page.getByRole("button", { name: "عرض الطلب" }).click();
    await expect(page).toHaveURL(orderUrl);
  });

  test("prescription items have no price and no cart", async ({ page }) => {
    await page.goto("/store");
    const rx = page.getByRole("article").filter({ hasText: "أموكسيسيلين" });
    await expect(rx).toContainText("يتطلب وصفة — يراجعه الصيدلي");
    await expect(rx).not.toContainText("ج.س");
    await expect(rx.getByRole("button", { name: "أضف إلى السلة" })).toHaveCount(0);
    await expect(rx.getByRole("link", { name: "اطلب مراجعة الصيدلي" })).toBeVisible();
  });
});

test.describe("orders in the workspace", () => {
  test("staff see the guest's order once, confirm it and get the WhatsApp text", async ({
    page,
  }) => {
    await signIn(page, "admin");
    await page.goto("/orders");
    const rows = page
      .getByRole("table", { name: "الطلبات" })
      .getByRole("row", { name: new RegExp(PHONE) });
    await expect(rows).toHaveCount(1); // the double click made one order
    await expect(rows).toContainText("جديد — بانتظار المراجعة");
    await rows.click();
    await expect(page).toHaveURL(/\/orders\/detail\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("wa-text")).toContainText("سلمى أحمد");
    await page.getByRole("button", { name: "تأكيد الطلب" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "تأكيد" }).click();
    await expect(page.getByText("● مؤكد").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "بدء التجهيز" })).toBeVisible();
    await expect(page.getByRole("button", { name: "تأكيد الطلب" })).toHaveCount(0);
  });

  test("an incomplete listing cannot be published", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/storefront/catalog");
    await page.getByRole("searchbox", { name: "ابحث عن صنف" }).fill("Augmentin");
    const row = page.getByRole("row", { name: /أموكسيسيلين\/كلافولانيك/ });
    await expect(row).toContainText("صورة");
    await expect(row.getByRole("switch")).toBeDisabled();
  });
});
