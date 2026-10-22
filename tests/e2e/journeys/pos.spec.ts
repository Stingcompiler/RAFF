import { expect, type Page, test } from "@playwright/test";

import { registerCounter, signIn } from "../support/auth";

// One counter, one shift: the journeys run in order on the same device.
test.describe.configure({ mode: "serial" });

async function atCounter(page: Page) {
  await registerCounter(page);
  await signIn(page, "salma");
  await page.goto("/pos");
}

const search = (page: Page) => page.getByRole("textbox", { name: /اسم، اسم علمي، أو باركود/ });
const lines = (page: Page) => page.getByTestId("cart-line");
const total = (page: Page) => page.getByTestId("cart-total");

async function salesCount(page: Page): Promise<number> {
  const res = await page.request.get("/api/v1/shifts/current/");
  return (await res.json()).sales_count;
}

test.describe("point of sale", () => {
  test("open a shift, scan with a multiplier, pay cash with change, approve once", async ({
    page,
  }) => {
    await atCounter(page);
    const shift = page.getByRole("dialog", { name: "فتح وردية" });
    await shift.getByLabel("الرصيد الافتتاحي").fill("50000");
    await shift.getByRole("button", { name: "فتح وردية" }).click();
    await expect(page.getByTestId("shift-label")).toContainText("وردية 1");

    await search(page).fill("3*");
    await expect(page.getByTestId("multiplier")).toHaveText("× 3");
    await search(page).fill("6221234500017"); // Paracetamol strip barcode
    await search(page).press("Enter");
    await expect(lines(page)).toHaveCount(1);
    await expect(lines(page).first()).toContainText("باراسيتامول");
    await expect(lines(page).first().getByLabel("الكمية")).toHaveValue("3");
    await expect(total(page)).toHaveText("2,400 ج.س");

    await search(page).fill("ORS");
    await expect(page.getByRole("option", { name: /ORS sachet/ })).toBeVisible();
    await search(page).press("Enter");
    await expect(lines(page)).toHaveCount(2);
    await expect(total(page)).toHaveText("2,700 ج.س");

    await page.keyboard.press("F8");
    const pay = page.getByRole("dialog", { name: "الدفع" });
    await expect(pay.getByTestId("pay-total")).toHaveText("2,700 ج.س");
    await pay.getByLabel("المدفوع").fill("5000");
    await expect(pay.getByTestId("change")).toHaveText("2,300 ج.س");

    const before = await salesCount(page);
    await pay.getByRole("button", { name: "اعتماد البيع" }).dblclick();
    const approved = page.getByRole("dialog", { name: "اعتُمد البيع" });
    await expect(approved).toBeVisible();
    await expect(approved.getByTestId("approved-total")).toHaveText("2,700 ج.س");
    await expect(approved.getByTestId("approved-change")).toHaveText("2,300 ج.س");
    await expect(approved).toContainText("فاتورة INV-");
    expect(await salesCount(page)).toBe(before + 1);

    await page.keyboard.press("Enter");
    await expect(approved).toBeHidden();
    await expect(page.getByText("السلة فارغة")).toBeVisible();
  });

  test("a lost response is checked by its key before any second approval", async ({ page }) => {
    await atCounter(page);
    await search(page).fill("ORS");
    await search(page).press("Enter");
    await expect(total(page)).toHaveText("300 ج.س");

    // The server records the sale but the answer never reaches the counter.
    await page.route("**/api/v1/sales/", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fetch();
      await route.abort("timedout");
    });
    const before = await salesCount(page);
    await page.keyboard.press("F8");
    await page
      .getByRole("dialog", { name: "الدفع" })
      .getByRole("button", { name: "اعتماد البيع" })
      .click();
    await expect(page.getByText(/نتيجة العملية قيد التحقق/)).toBeVisible();
    await expect(page.getByRole("button", { name: /^الدفع/ })).toBeDisabled();
    await page.unroute("**/api/v1/sales/");

    await page.getByRole("button", { name: "استعلام النتيجة" }).click();
    await expect(page.getByRole("dialog", { name: "اعتُمد البيع" })).toBeVisible();
    expect(await salesCount(page)).toBe(before + 1);
  });

  test("hold a sale and resume it later", async ({ page }) => {
    await atCounter(page);
    await search(page).fill("Paracetamol");
    await expect(page.getByRole("option", { name: /Paracetamol/ })).toBeVisible();
    await search(page).press("Enter");
    await expect(lines(page)).toHaveCount(1);

    await page.keyboard.press("F4");
    await expect(page.getByText("عُلّق البيع")).toBeVisible();
    await expect(lines(page)).toHaveCount(0);

    await page.keyboard.press("F6");
    const held = page.getByRole("dialog", { name: "المبيعات المعلّقة" });
    await held
      .getByRole("button", { name: /استئناف/ })
      .first()
      .click();
    await expect(held).toBeHidden();
    await expect(lines(page)).toHaveCount(1);
    await expect(lines(page).first()).toContainText("باراسيتامول");
    await expect(total(page)).toHaveText("800 ج.س");
    await lines(page).first().getByRole("button", { name: "حذف السطر" }).click();
    await expect(lines(page)).toHaveCount(0);
  });

  test("credit over the limit is refused and the cart is kept", async ({ page }) => {
    await atCounter(page);
    await search(page).fill("6221234567890"); // Augmentin box
    await search(page).press("Enter");
    const qty = lines(page).first().getByLabel("الكمية");
    await qty.fill("6");
    await expect(total(page)).toHaveText("75,000 ج.س");

    await page.keyboard.press("F8");
    const pay = page.getByRole("dialog", { name: "الدفع" });
    await pay.getByRole("radio", { name: "آجل" }).click();
    await pay.getByLabel("بحث عن عميل آجل").fill("الأمل");
    await pay.getByRole("button", { name: /الأمل/ }).click();
    await expect(pay.getByTestId("credit-left")).toHaveText("-9,000 ج.س");
    await pay.getByRole("button", { name: "اعتماد البيع" }).click();
    await expect(pay.getByRole("alert")).toHaveText("يتجاوز الحد الائتماني");
    await pay.getByRole("button", { name: "رجوع" }).click();
    await expect(lines(page)).toHaveCount(1);

    await qty.fill("5");
    await expect(total(page)).toHaveText("62,500 ج.س");
    await page.keyboard.press("F8");
    await pay.getByRole("radio", { name: "آجل" }).click();
    await pay.getByLabel("بحث عن عميل آجل").fill("الأمل");
    await pay.getByRole("button", { name: /الأمل/ }).click();
    await pay.getByRole("button", { name: "اعتماد البيع" }).click();
    await expect(page.getByRole("dialog", { name: "اعتُمد البيع" })).toBeVisible();
  });

  test("short stock is flagged on the line and payment stays disabled", async ({ page }) => {
    await atCounter(page);
    await search(page).fill("ORS");
    await search(page).press("Enter");
    await lines(page).first().getByLabel("الكمية").fill("500");
    await expect(lines(page).first().getByRole("alert")).toContainText("الرصيد غير كافٍ");
    await expect(page.getByRole("button", { name: /^الدفع/ })).toBeDisabled();
    await lines(page).first().getByRole("button", { name: "حذف السطر" }).click();
  });

  test("no results offers to log the missing item", async ({ page }) => {
    await atCounter(page);
    await search(page).fill("xyzq");
    await expect(page.getByText("لا نتائج لـ «xyzq»")).toBeVisible();
    await page.getByRole("button", { name: "تسجيل طلب غير متوفر" }).click();
    await expect(page.getByText("سُجّل الطلب")).toBeVisible();
  });

  test("a ready storefront order becomes one sale and completes", async ({ page }) => {
    await page.request.get("/api/v1/auth/csrf/");
    const token = async () =>
      (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
    const placed = await page.request.post("/api/v1/public/orders/", {
      data: {
        name: "زبون المتجر",
        phone: "0911111111",
        note: "",
        agree: true,
        lines: [{ slug: "par-500", quantity: 2 }],
      },
      headers: { "x-csrftoken": await token(), "idempotency-key": crypto.randomUUID() },
    });
    expect(placed.ok(), await placed.text()).toBe(true);
    const { number } = await placed.json();

    await atCounter(page);
    const headers = { "x-csrftoken": await token() };
    const [row] = await (await page.request.get(`/api/v1/orders/?q=${number}`)).json();
    for (const to of ["confirmed", "preparing", "ready"]) {
      const moved = await page.request.post(`/api/v1/orders/${row.id}/transition/`, {
        data: { to },
        headers,
      });
      expect(moved.ok(), await moved.text()).toBe(true);
    }

    await search(page).fill("Paracetamol");
    await expect(page.getByRole("option", { name: /Paracetamol/ })).toContainText("محجوزة");

    await page.goto(`/pos?order=${row.id}`);
    await expect(page.getByTestId("from-order")).toContainText(number);
    await expect(lines(page)).toHaveCount(1);
    await expect(lines(page).first().getByRole("button", { name: "حذف السطر" })).toBeDisabled();
    await expect(total(page)).toHaveText("1,600 ج.س");
    await page.keyboard.press("F8");
    await page
      .getByRole("dialog", { name: "الدفع" })
      .getByRole("button", { name: "اعتماد البيع" })
      .click();
    await expect(page.getByRole("dialog", { name: "اعتُمد البيع" })).toBeVisible();

    const done = await (await page.request.get(`/api/v1/orders/${row.id}/`)).json();
    expect(done.status).toBe("completed");
    expect(done.sale_number).toMatch(/^INV-/);
  });
});
