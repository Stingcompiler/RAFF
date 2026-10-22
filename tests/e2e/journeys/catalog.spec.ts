import { writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { signIn } from "../support/auth";

test.describe("items & stock", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "admin");
  });

  test("search ignores hamza: ادفانس finds أدفانس", async ({ page }) => {
    const n = Date.now() % 100000;
    const code = `ADV-${n}`;
    await page.goto("/inventory");
    await page.getByRole("button", { name: "صنف جديد" }).click();
    const form = page.getByRole("dialog");
    await form.getByLabel("رمز الصنف").fill(code);
    await form.getByLabel("الاسم بالعربية").fill(`أدفانس ${n}`);
    await form.getByLabel("الاسم بالإنجليزية").fill(`Advance ${n}`);
    await form.getByLabel("التركيز").fill("500 mg");
    await form.getByLabel("الشكل").fill("tab");
    await form.getByLabel("الوحدة الأساس (عربي)").fill("قرص");
    await form.getByLabel("الوحدة الأساس (إنجليزي)").fill("Tablet");
    await form.getByLabel("وحدة البيع (عربي)").fill("شريط");
    await form.getByLabel("وحدة البيع (إنجليزي)").fill("Strip");
    await form.getByLabel("عدد الوحدات الأساس فيها").fill("10");
    await form.getByLabel("سعر البيع").fill("850");
    await form.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByRole("status").filter({ hasText: "تم الحفظ" })).toBeVisible();
    await page.getByRole("button", { name: "إغلاق" }).click();

    await page.getByRole("searchbox", { name: "بحث في الأصناف" }).fill(`ادفانس ${n}`);
    const row = page.getByRole("row", { name: new RegExp(`أدفانس ${n}`) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("850");
    // The exact item ranks first; similar names may follow.
    await expect(page.getByRole("row").nth(1)).toContainText(`أدفانس ${n}`);
  });

  test("item drawer shows units, barcodes and price history; new price is a new version", async ({
    page,
  }) => {
    await page.goto("/inventory");
    await page.getByRole("searchbox", { name: "بحث في الأصناف" }).fill("6221234567890");
    await page.getByRole("row", { name: /Augmentin/ }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toContainText("625 mg tab · 6221234567890");
    await drawer.getByRole("tab", { name: "الوحدات والباركود" }).click();
    await expect(drawer).toContainText("1 = 14 Tablet");
    await expect(drawer).toContainText("6221234567891");
    await drawer.getByRole("tab", { name: "الأسعار" }).click();
    await expect(drawer).toContainText("12,500");
    await drawer.getByRole("button", { name: "سعر جديد" }).click();
    const priceForm = page.getByRole("dialog", { name: "سعر جديد" });
    await priceForm.getByLabel("سعر البيع", { exact: true }).fill("13000");
    const year = 2100 + (Date.now() % 800);
    await priceForm.getByLabel("يسري من").fill(`${year}-01-01`);
    await priceForm.getByRole("button", { name: "حفظ" }).click();
    await page.getByRole("tab", { name: "الأسعار" }).click();
    await expect(page.getByRole("dialog")).toContainText(`${year}-01-01`);
    await expect(page.getByRole("dialog")).toContainText("13,000");
  });

  test("CSV import previews matches and applies once", async ({ page }, testInfo) => {
    const n = Date.now() % 100000;
    const csv =
      "code,name_ar,name_en,generic_name,strength,dosage_form,category,classification," +
      "base_unit_ar,base_unit_en,sale_unit_ar,sale_unit_en,sale_unit_factor,barcode,price,reorder_level\n" +
      `IMP-${n}-1,دواء مستورد ${n},Imported drug ${n},,10 mg,tab,analgesics,otc,قرص,Tablet,شريط,Strip,10,,500,10\n` +
      `PAR-500,باراسيتامول,Paracetamol,paracetamol,500 mg,tab,analgesics,otc,قرص,Tablet,,,,,800,20\n` +
      `IMP-${n}-2,مكرر,Dup,,,,,,قرص,Tablet,,,,6221234567890,,\n` +
      `IMP-${n}-3,,No Arabic,,,,,,قرص,Tablet,,,,,abc,\n`;
    const file = testInfo.outputPath("items.csv");
    writeFileSync(file, csv);
    await page.goto("/inventory/import");
    await page.locator("input[type=file]").setInputFiles(file);
    await page.getByRole("button", { name: "معاينة" }).click();
    await expect(page.getByRole("row", { name: new RegExp(`دواء مستورد ${n}`) })).toContainText(
      "جديد",
    );
    await expect(page.getByRole("row", { name: /باراسيتامول/ })).toContainText("تحديث");
    await expect(page.getByRole("row", { name: /مكرر/ })).toContainText("الباركود لصنف آخر");
    await expect(page.getByRole("row", { name: new RegExp(`IMP-${n}-3`) })).toContainText(
      "الاسم العربي ناقص",
    );
    await page.getByRole("button", { name: "اعتماد الاستيراد" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "اعتماد الاستيراد" }).click();
    await expect(page.getByText("تم الاستيراد: 1 جديد، 1 تحديث").first()).toBeVisible();
    await page.goto("/inventory");
    await page.getByRole("searchbox", { name: "بحث في الأصناف" }).fill(`دواء مستورد ${n}`);
    await expect(page.getByRole("row", { name: new RegExp(`دواء مستورد ${n}`) })).toBeVisible();
  });

  test("cashier can view items but not create or import", async ({ page }) => {
    await page.context().clearCookies();
    await signIn(page, "salma");
    await page.goto("/inventory");
    await expect(page.getByRole("row", { name: /Paracetamol/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "صنف جديد" })).toHaveCount(0);
    await page.goto("/inventory/import");
    await expect(page).toHaveURL(/\/inventory$/);
  });
});
