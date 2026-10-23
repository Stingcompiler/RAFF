import { expect, type Page, test } from "@playwright/test";

import { signIn } from "../support/auth";

// Raff Mobile: the same routes at ≤760px with the bottom navigation.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const nav = (page: Page) => page.getByRole("navigation", { name: "التنقل السفلي" });
const main = (page: Page) => page.getByRole("main");

async function csrf(page: Page) {
  await page.request.get("/api/v1/auth/csrf/");
  return (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
}

test.describe("phone navigation", () => {
  test("four destinations, no top bar, the current one marked", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/inventory");
    await expect(nav(page).getByRole("link")).toHaveText(["بحث", "جرد", "اليوم", "بيع"]);
    await expect(nav(page).getByRole("link", { name: "بحث" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("banner")).toHaveCount(0);

    await nav(page).getByRole("link", { name: "جرد" }).click();
    await expect(page).toHaveURL(/\/stocktake\/?$/);
    await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("جرد");
    await nav(page).getByRole("link", { name: "اليوم" }).click();
    await expect(page).toHaveURL(/\/dashboard\/?$/);
    await expect(nav(page).getByRole("link", { name: "اليوم" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("the page never scrolls sideways, even where a screen has no phone design", async ({
    page,
  }) => {
    await signIn(page, "admin");
    for (const path of ["/inventory", "/orders", "/purchases", "/reports", "/settings"]) {
      await page.goto(path);
      await expect(nav(page)).toBeVisible();
      const [scroll, width] = await page.evaluate(() => [
        document.documentElement.scrollWidth,
        window.innerWidth,
      ]);
      expect(scroll, path).toBeLessThanOrEqual(width);
    }
  });

  test("a table scrolls inside its card and keeps its name column", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/purchases");
    const table = page.getByRole("table", { name: "الاستلامات" });
    await expect(table.getByRole("row").nth(1)).toBeVisible();
    const name = table.getByRole("columnheader").first();
    expect((await name.boundingBox())?.width).toBeGreaterThan(100);
  });
});

test.describe("quick item search", () => {
  test("find an item and open its batch details", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/inventory");
    await page.getByRole("searchbox", { name: "اسم أو باركود" }).fill("ORS");
    const card = page.getByRole("button", { name: /محلول الإرواء/ });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("aria-expanded", "false");
    await card.click();
    await expect(card).toHaveAttribute("aria-expanded", "true");
    await expect(card).toContainText("الدفعة:");
    await expect(card).toContainText("الصلاحية:");
    await expect(card).toContainText("الشكل:");
    await expect(card).not.toContainText("الدفعة: —");

    await page.getByRole("searchbox", { name: "اسم أو باركود" }).fill("zzzz-none");
    await expect(page.getByText("لا نتائج. جرّب الاسم العلمي.")).toBeVisible();
  });
});

test.describe("owner summary", () => {
  test("sales, the needs-action rows and the branch switch", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/dashboard");
    await expect(main(page).getByRole("heading", { level: 1 })).toHaveText("اليوم");
    await expect(main(page)).toContainText("مبيعات اليوم");
    await expect(main(page)).toContainText("أصناف تنتهي خلال");
    await expect(main(page)).toContainText("فروق وردية غير مسوّاة");
    await expect(main(page)).toContainText("تحويلات بانتظار الاستلام");

    const all = page.getByRole("radio", { name: "كل الفروع" });
    await expect(all).toHaveAttribute("aria-checked", "false");
    const reply = page.waitForResponse((r) => r.url().includes("/dashboard/?scope=all"));
    await all.click();
    await reply;
    await expect(all).toHaveAttribute("aria-checked", "true");
  });
});

test.describe("store orders on a phone", () => {
  test("move an order forward and open WhatsApp from its card", async ({ page }) => {
    const token = await csrf(page);
    const placed = await page.request.post("/api/v1/public/orders/", {
      data: {
        name: "زبون الهاتف",
        phone: "0933333333",
        note: "",
        agree: true,
        lines: [{ slug: "par-500", quantity: 1 }],
      },
      headers: { "x-csrftoken": token, "idempotency-key": crypto.randomUUID() },
    });
    expect(placed.ok(), await placed.text()).toBe(true);
    const { number } = await placed.json();

    await signIn(page, "admin");
    await page.goto("/orders");
    const card = page.getByRole("article").filter({ hasText: number });
    await expect(card).toContainText("■ جديد");
    await expect(card.getByRole("link", { name: /واتساب/ })).toHaveAttribute(
      "href",
      "https://wa.me/249933333333",
    );
    await card.getByRole("button", { name: "← مؤكد" }).click();
    await expect(card).toContainText("● مؤكد");
    await card.getByRole("button", { name: "← قيد التجهيز" }).click();
    await expect(card).toContainText("■ قيد التجهيز");
    await card.getByRole("button", { name: "← جاهز للاستلام" }).click();
    await expect(card).toContainText("● جاهز للاستلام");
    await expect(card).toContainText("يُكمل بالفاتورة في نقطة البيع");
    await expect(card.getByRole("button")).toHaveCount(0);
  });
});

test.describe("camera count", () => {
  test("without a camera the barcode is typed, counted and confirmed", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/stocktake");
    const start = page.getByRole("button", { name: "ابدأ جرداً لكل الفرع" });
    const denied = page.getByText("تعذّر الوصول إلى الكاميرا");
    // Either a count is already open (camera box) or the phone view offers to start one.
    await expect(start.or(denied)).toBeVisible();
    if (await start.isVisible()) await start.click();

    await expect(denied).toBeVisible();
    await expect(main(page)).toContainText("من"); // "scope · counted of total"
    await page.getByLabel("باركود أو اسم الصنف").fill("6221234500017"); // Paracetamol strip
    await main(page).getByRole("button", { name: "بحث" }).click();
    await expect(main(page)).toContainText("باراسيتامول");

    const system = Number(
      (await main(page).getByText("النظام").locator("b").textContent())?.replace(/\D/g, ""),
    );
    const counted = main(page).getByLabel("الكمية المعدودة");
    await counted.fill(String(system - 1));
    await expect(main(page)).toContainText("نقص 1");
    await main(page).getByRole("button", { name: "زيادة" }).click();
    await expect(counted).toHaveValue(String(system));
    await expect(main(page)).toContainText("مطابق للنظام");

    await main(page).getByRole("button", { name: "تأكيد العد" }).click();
    await expect(page.getByText("حُفظ العد")).toBeVisible();
  });
});
