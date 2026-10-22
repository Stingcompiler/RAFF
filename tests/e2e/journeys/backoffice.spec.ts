import { expect, type Page, test } from "@playwright/test";

import { signIn } from "../support/auth";

async function csrf(page: Page) {
  return (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
}

test.describe("overview, parties, transfers, reports", () => {
  test("overview shows what needs action and today's figures", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "نظرة عامة" })).toBeVisible();
    const actions = page.getByRole("link", { name: /أصناف تنتهي خلال 90 يوماً/ });
    await expect(actions).toBeVisible();
    await expect(page.getByText("مبيعات اليوم")).toBeVisible();
    await expect(page.getByRole("table", { name: "آخر العمليات" })).toBeVisible();
    await actions.click();
    await expect(page).toHaveURL(/\/reports\?r=expiry$/);
    const expiry = page.getByRole("table", { name: "الصلاحيات" });
    await expect(expiry).toContainText("B-2301");
    await expect(expiry).toContainText("2026-12-02");
  });

  test("accountant records an advance payment and sees it in the ledger", async ({ page }) => {
    await signIn(page, "huda");
    await page.goto("/parties");
    // Al-Nour: no other journey touches it (the POS journeys sell on credit to Al-Amal).
    const customers = page.getByRole("table", { name: "العملاء" });
    const nour = customers.getByRole("row", { name: /عيادة النور/ });
    await expect(nour).toContainText("0 ج.س");
    await nour.click();
    await page.getByRole("button", { name: "تسجيل دفعة" }).click();
    const dialog = page.getByRole("dialog", { name: "تسجيل دفعة" });
    await dialog.getByLabel("المبلغ").fill("4000");
    await expect(dialog).toContainText("-4,000 ج.س"); // an advance: the clinic is in credit
    await dialog.getByRole("button", { name: "تسجيل" }).click();
    await expect(page.getByText(/سُجّلت الدفعة PAY-/)).toBeVisible();
    await expect(nour).toContainText("-4,000");
    const ledger = page.getByRole("table", { name: /دفتر الحركات — عيادة النور/ });
    await expect(ledger.getByRole("row", { name: /دفعة PAY-/ })).toContainText("4,000");
  });

  test("send a transfer to Omdurman and receive it short", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/transfers");
    await page.getByRole("button", { name: "تحويل جديد" }).click();
    const dialog = page.getByRole("dialog", { name: "تحويل جديد" });
    await dialog.getByLabel("إلى فرع").selectOption({ label: "فرع أم درمان (تجريبي)" });
    await dialog.getByLabel("ابحث عن صنف").fill("PAR-500");
    await dialog.getByRole("option", { name: /باراسيتامول/ }).click();
    await expect(dialog.getByLabel("الدفعة")).toContainText("B-9120");
    await dialog.getByLabel("الكمية (بوحدة البيع)").fill("5");
    await dialog.getByRole("button", { name: "إضافة" }).click();
    await dialog.getByRole("button", { name: "حفظ المسودة" }).click();
    await expect(page.getByText("حُفظت المسودة")).toBeVisible();

    await page.getByRole("button", { name: /^إرسال/ }).click();
    const confirm = page.getByRole("dialog", { name: "إرسال التحويل" });
    await confirm.getByRole("button", { name: /^إرسال/ }).click();
    await expect(page.getByText("أُرسل التحويل")).toBeVisible();
    const list = page.getByRole("table", { name: "التحويلات" });
    const row = list.getByRole("row", { name: /T-\d{4}/ }).first();
    await expect(row).toContainText("مرسَل");
    const number = (await row.getByRole("cell").first().textContent())?.trim() ?? "";

    // Switch the session to Omdurman and receive 4 of the 5 strips.
    const branches = await (await page.request.get("/api/v1/branches/")).json();
    const omd = branches.find((b: { code: string }) => b.code === "OMD");
    await page.request.post("/api/v1/auth/context/", {
      data: { branch_id: omd.id, device_id: null },
      headers: { "x-csrftoken": await csrf(page) },
    });
    await page.goto("/transfers");
    await page
      .getByRole("table", { name: "التحويلات" })
      .getByRole("row", { name: new RegExp(number) })
      .click();
    const receive = page.getByRole("table", { name: `استلام ${number} — مطابقة الكميات` });
    await receive.getByLabel(/المستلَم — باراسيتامول/).fill("4");
    await expect(receive).toContainText("-1");
    await page.getByRole("button", { name: "اعتماد الاستلام" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "اعتماد الاستلام" }).click();
    await expect(page.getByText("اعتُمد الاستلام")).toBeVisible();
    await expect(
      page.getByRole("table", { name: "التحويلات" }).getByRole("row", { name: new RegExp(number) }),
    ).toContainText("مستلَم جزئياً");
  });

  test("reports: stock at cost with totals and CSV export", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/reports");
    await page.getByRole("button", { name: "المخزون بالتكلفة" }).click();
    const table = page.getByRole("table", { name: "المخزون بالتكلفة" });
    await expect(table.getByRole("row", { name: /AUG-625/ })).toBeVisible();
    await expect(page.getByTestId("total-value")).not.toBeEmpty();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير" }).click();
    expect((await download).suggestedFilename()).toBe("stock_value.csv");
  });
});
