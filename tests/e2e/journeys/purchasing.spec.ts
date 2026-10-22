import { expect, test } from "@playwright/test";

import { signIn } from "../support/auth";

test.describe("purchasing & stock", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "admin");
  });

  test("stock, nearest expiry and status come from received batches", async ({ page }) => {
    await page.goto("/inventory");
    await page.getByRole("searchbox", { name: "بحث في الأصناف" }).fill("AUG-625");
    const row = page.getByRole("row", { name: /Augmentin/ });
    await expect(row).toContainText("2026-12-02");
    await expect(row).toContainText("قرب الانتهاء");
    await row.click();
    const batches = page.getByRole("table", { name: "الدفعات" });
    await expect(batches).toContainText("B-2301");
    await expect(batches).toContainText("B-2310");
  });

  test("receive goods: bonus, held line, approve once, then release the held batch", async ({
    page,
  }) => {
    const n = Date.now() % 1000000;
    await page.goto("/purchases");
    await page.getByRole("link", { name: "استلام جديد" }).click();
    await page
      .getByLabel("المورد", { exact: true })
      .selectOption({ label: "شركة الندى للأدوية (تجريبي)" });
    await page.getByLabel("رقم فاتورة المورد").fill(`E2E-${n}`);
    await page.getByRole("button", { name: "حفظ الرأس" }).click();
    await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]{36}$/);

    for (const [query, qty, bonus, batch, expiry] of [
      ["Paracetamol", "10", "2", `P-${n}`, "2028-05-31"],
      ["Ibuprofen", "5", "0", `I-${n}`, ""],
    ] as const) {
      await page.getByRole("button", { name: "إضافة سطر" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("textbox", { name: "ابحث عن صنف" }).fill(query);
      await dialog
        .getByRole("option", { name: new RegExp(query) })
        .first()
        .click();
      await dialog.getByLabel("الكمية").fill(qty);
      await dialog.getByLabel("بونص").fill(bonus);
      await dialog.getByLabel("تكلفة الوحدة").fill("600");
      await dialog.getByLabel("رقم الدفعة").fill(batch);
      if (expiry) await dialog.getByLabel("الصلاحية").fill(expiry);
      await dialog.getByRole("button", { name: "حفظ" }).click();
      await expect(page.getByRole("row", { name: new RegExp(batch) })).toBeVisible();
    }
    await expect(page.getByRole("row", { name: new RegExp(`P-${n}`) })).toContainText("جاهز للبيع");
    await expect(page.getByRole("row", { name: new RegExp(`I-${n}`) })).toContainText(
      "ناقص — يُحجز للمراجعة",
    );
    await expect(page.getByText("9,000 ج.س")).toBeVisible(); // 10×600 + 5×600, computed by the server
    await expect(page.getByText("1,200 ج.س")).toBeVisible(); // bonus allocated: 2×600

    await page.getByRole("button", { name: "اعتماد الاستلام" }).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm).toContainText("+9,000 ج.س");
    await confirm.getByRole("button", { name: "اعتماد الاستلام" }).dblclick();
    await expect(page.getByRole("status").filter({ hasText: "تم اعتماد الاستلام" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("GR-");

    await page.goto("/inventory");
    await page.getByRole("searchbox", { name: "بحث في الأصناف" }).fill("IBU-400");
    await page.getByRole("row", { name: /Ibuprofen/ }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("tab", { name: "الدفعات" }).click();
    await drawer.getByRole("button", { name: "إفراج بصلاحية" }).click();
    const release = page.getByRole("dialog", { name: "إفراج عن دفعة محجوزة" });
    await release.getByLabel("تاريخ الصلاحية").fill("2028-12-31");
    await release.getByRole("button", { name: "إفراج بصلاحية" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "أصبحت الدفعة قابلة للبيع" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "الحركات" }).click();
    await expect(page.getByRole("dialog").first()).toContainText("إفراج");
  });

  test("an approved receipt is read-only", async ({ page }) => {
    await page.goto("/purchases");
    await page.getByRole("row", { name: /GR-000001/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("GR-000001");
    await expect(page.getByRole("button", { name: "اعتماد الاستلام" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "إضافة سطر" })).toHaveCount(0);
  });
});
