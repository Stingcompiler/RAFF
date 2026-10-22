import { expect, type Page, test } from "@playwright/test";

import { registerCounter, signIn } from "../support/auth";

test.describe.configure({ mode: "serial" });

async function csrf(page: Page) {
  return (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
}

/** A cash sale of two ORS sachets at Counter 2 (the POS journeys use Counter 1), via the API. */
async function sellTwoSachets(page: Page): Promise<string> {
  await registerCounter(page, "Counter 2");
  await signIn(page, "salma");
  const headers = { "x-csrftoken": await csrf(page) };
  await page.request.post("/api/v1/shifts/", { data: { opening_cash: "50000" }, headers });
  const [ors] = await (await page.request.get("/api/v1/pos/items/?q=ORS")).json();
  const sale = await page.request.post("/api/v1/sales/", {
    data: {
      lines: [{ item_id: ors.id, unit_id: ors.unit.id, quantity: 2 }],
      payments: [{ method: "cash", amount: "600" }],
    },
    headers: { ...headers, "idempotency-key": crypto.randomUUID() },
  });
  expect(sale.ok(), await sale.text()).toBe(true);
  return (await sale.json()).number;
}

test.describe("returns & quarantine", () => {
  test("cashier returns one sachet; it waits in quarantine for the pharmacist", async ({
    page,
  }) => {
    const number = await sellTwoSachets(page);
    await page.goto("/returns");
    await page.getByLabel("رقم الفاتورة").fill(number);
    await page.getByRole("button", { name: "بحث" }).click();
    const form = page.getByRole("table", { name: `مرتجع من فاتورة ${number}` });
    await form.getByLabel("المرتجع ORS sachet").fill("3");
    await expect(form.getByLabel("المرتجع ORS sachet")).toHaveValue("2"); // never more than sold
    await form.getByLabel("المرتجع ORS sachet").fill("1");
    await form.getByLabel("السبب ORS sachet").selectOption({ label: "تغليف تالف" });
    await page.getByRole("button", { name: "اعتماد المرتجع" }).click();

    const confirm = page.getByRole("dialog", { name: "اعتماد المرتجع" });
    await expect(confirm).toContainText("300 ج.س"); // priced by the server
    await confirm.getByRole("button", { name: "اعتماد المرتجع" }).click();
    await expect(page.getByText(/اعتُمد المرتجع RET-/)).toBeVisible();

    const quarantine = page.getByRole("table", { name: "الحجر — بانتظار القرار" });
    const row = quarantine.getByRole("row", { name: /محلول الإرواء الفموي/ });
    await expect(row).toContainText("1 كيس");
    await expect(row).toContainText("بانتظار الفحص"); // the cashier cannot decide
    await expect(page.getByRole("table", { name: "آخر المرتجعات" })).toContainText(number);
  });

  test("the pharmacist restocks it and recalls a batch", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/returns");
    const quarantine = page.getByRole("table", { name: "الحجر — بانتظار القرار" });
    const row = quarantine.getByRole("row", { name: /محلول الإرواء الفموي/ });
    await row.getByRole("button", { name: "إعادة للرف" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("1 كيس");
    await dialog.getByRole("button", { name: "إعادة للرف" }).click();
    await expect(page.getByText("سُجّل القرار")).toBeVisible();
    await expect(row).toHaveCount(0);

    await page.getByRole("button", { name: "استدعاء دفعة" }).click();
    const recall = page.getByRole("dialog", { name: "استدعاء دفعة" });
    await recall.getByLabel("ابحث عن صنف").fill("Cough");
    await recall.getByRole("option", { name: /شراب سعال/ }).click();
    await expect(recall.getByLabel("اختر الدفعة")).toContainText("B-3301");
    await recall.getByLabel("سبب الاستدعاء").fill("تنبيه من المصنع");
    await recall.getByRole("button", { name: "استدعاء دفعة" }).click();
    await expect(page.getByText("حُجزت الدفعة")).toBeVisible();
    const recalled = quarantine.getByRole("row", { name: /شراب سعال/ });
    await expect(recalled).toContainText("استدعاء — حجر كامل الدفعة");
    await expect(recalled).toContainText("7 زجاجة");
  });
});

test.describe("stocktake", () => {
  test("count a shortage against the snapshot and approve it", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/stocktake");
    await page.getByRole("button", { name: "جرد جديد" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "بدء الجرد" }).click();
    await expect(page).toHaveURL(/\/stocktake\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "جرد — كل الفرع" })).toBeVisible();

    await page.getByRole("searchbox", { name: "تصفية الأصناف" }).fill("OME");
    const row = page.getByRole("row", { name: /أوميبرازول/ });
    await expect(row).toContainText("18");
    await row.getByLabel("المعدود: أوميبرازول").fill("16");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(row).toContainText("-2");
    await expect(row).toContainText("نقص — سبب مطلوب");
    await page.getByLabel("سبب الفرق — أوميبرازول").fill("شريطان تالفان");
    await page.getByRole("button", { name: "اعتماد الجرد" }).click();

    const confirm = page.getByRole("dialog", { name: "اعتماد الجرد" });
    await expect(confirm).toContainText("أصناف بفروق");
    await expect(confirm).toContainText("-3,600 ج.س"); // 2 strips at 1,800, from the server
    await confirm.getByRole("button", { name: "اعتماد الجرد" }).click();
    await expect(page.getByText("تم اعتماد الجرد")).toBeVisible();
    await expect(page.getByRole("button", { name: "اعتماد الجرد" })).toHaveCount(0);

    await page.goto("/stocktake");
    await expect(page.getByRole("table", { name: "عمليات الجرد" })).toContainText("معتمد");
  });
});

test.describe("shifts & cash (Counter 2)", () => {
  test("confirm a bank transfer, close the shift short, then settle it", async ({ page }) => {
    // A bank sale on Counter 2 (the returns journeys above already opened its shift).
    await registerCounter(page, "Counter 2");
    await signIn(page, "admin");
    const headers = { "x-csrftoken": await csrf(page) };
    await page.request.post("/api/v1/shifts/", { data: { opening_cash: "50000" }, headers });
    const [ors] = await (await page.request.get("/api/v1/pos/items/?q=ORS")).json();
    const sale = await page.request.post("/api/v1/sales/", {
      data: {
        lines: [{ item_id: ors.id, unit_id: ors.unit.id, quantity: 1 }],
        payments: [{ method: "bank", amount: "300", bank_reference: "BK-E2E-1" }],
      },
      headers: { ...headers, "idempotency-key": crypto.randomUUID() },
    });
    expect(sale.ok(), await sale.text()).toBe(true);

    await page.goto("/shifts");
    const transfers = page.getByRole("table", { name: "التحويلات البنكية" });
    const row = transfers.getByRole("row", { name: /BK-E2E-1/ });
    await expect(row).toContainText("بانتظار التحقق");
    await row.getByRole("button", { name: "تأكيد الوصول" }).click();
    await expect(page.getByText("تأكد وصول التحويل")).toBeVisible();
    await expect(row).toHaveCount(0);

    await page.getByRole("button", { name: "إغلاق الوردية" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("النقد المعدود").fill("1");
    await expect(dialog).toContainText("عجز نقدي");
    await dialog.getByRole("button", { name: "إغلاق الوردية" }).click();
    await expect(page.getByText("أُغلقت الوردية")).toBeVisible();
    const log = page.getByRole("table", { name: "سجل الورديات" });
    const closed = log.getByRole("row", { name: /كاونتر 2/ }).first();
    await expect(closed).toContainText("غير مسوّاة");
    await closed.getByRole("button", { name: "تسوية" }).click();
    await expect(page.getByText("سُوّيت الوردية")).toBeVisible();
    await expect(closed).toContainText("مسوّاة");
  });
});
