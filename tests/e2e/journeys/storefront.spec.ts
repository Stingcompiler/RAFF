import { expect, test } from "@playwright/test";

import { signIn } from "../support/auth";

test.describe.configure({ mode: "serial" });

const PHONE = "0912345678";

test.describe("storefront home as a landing page", () => {
  test("one action with the same words, a text link beside it, no placeholder photo", async ({
    page,
  }) => {
    await page.goto("/");
    const action = page.getByRole("link", { name: "تصفّح المتجر", exact: true });
    await expect(action).toHaveCount(3); // hero, after the featured items, at the end
    await expect(page.getByRole("link", { name: "تواصل معنا" })).toHaveCSS(
      "text-decoration-line",
      "underline",
    ); // the channel is a text link, not a second button
    await expect(page.getByText("صورة", { exact: true })).toHaveCount(0);
    await page.goto("/about");
    await expect(page.getByText("صورة", { exact: true })).toHaveCount(0);
  });
});

test.describe("the shop as an app on a phone", () => {
  test("a bottom tab bar holds the five main pages and the cart count", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const bar = page.getByTestId("tab-bar");
    await expect(bar).toBeVisible();
    for (const name of ["الرئيسية", "المتجر", "السلة", "تتبّع طلب", "تواصل"])
      await expect(bar.getByRole("link", { name })).toBeVisible();
    await expect(bar.getByRole("link", { name: "الرئيسية" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await bar.getByRole("link", { name: "تتبّع طلب" }).click();
    await expect(page).toHaveURL(/\/orders\/track$/);
    await expect(bar.getByRole("link", { name: "تتبّع طلب" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await page.goto("/store?q=باراسيتامول");
    await page
      .getByRole("article")
      .filter({ hasText: "باراسيتامول" })
      .getByRole("button", { name: "أضف إلى السلة" })
      .click();
    await expect(bar.getByLabel(/1/)).toBeVisible();
  });

  test("the logo and the search share one row, and the search keeps a usable width", async ({
    page,
  }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 700 });
      await page.goto("/");
      const logo = (await page.getByRole("banner").getByRole("link").first().boundingBox())!;
      const search = (await page.getByRole("searchbox").boundingBox())!;
      expect(Math.abs(logo.y + logo.height / 2 - (search.y + search.height / 2))).toBeLessThan(12);
      expect(search.width).toBeGreaterThan(90);
      expect((await page.getByRole("banner").boundingBox())!.height).toBeLessThan(72);
    }
  });

  test("the tab bar is for phones only", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByTestId("tab-bar")).toBeHidden();
  });

  test("it is installable: manifest with the pharmacy's name, icons, worker and offline page", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    const res = await request.get("/manifest.webmanifest");
    expect(res.headers()["content-type"]).toContain("manifest+json");
    const m = await res.json();
    expect(m).toMatchObject({ display: "standalone", scope: "/", start_url: "/", dir: "rtl" });
    expect(m.name).toBeTruthy();
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBe(true);
    expect(sw.headers()["content-type"]).toContain("javascript");
    await page.goto("/offline");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("لا يوجد اتصال");
  });

  test("the worker never answers API calls or the workspace", async ({ request }) => {
    const sw = await (await request.get("/sw.js")).text();
    expect(sw).not.toMatch(/\/api\/|\/dashboard|\/pos/);
  });
});

test.describe("public storefront", () => {
  test("a guest finds an item, sends an order once and tracks it", async ({ page, context }) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 15.500654, longitude: 32.559899 });
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
    await expect(send).toBeDisabled(); // the location is required
    await page.getByLabel("موقعك").fill("ab");
    await expect(page.getByText("✕ اكتب عنوانك (3 أحرف على الأقل)")).toBeVisible();
    await expect(send).toBeDisabled();
    await page.getByLabel("موقعك").fill("الخرطوم — الرياض، قرب مسجد النور");
    await page.getByRole("button", { name: "استخدم موقعي الحالي" }).click();
    await expect(page.getByText("✓ تم تحديد موقعك الحالي")).toBeVisible();
    await send.dblclick();

    await expect(page).toHaveURL(/\/orders\/[A-Za-z0-9_-]{40,}$/);
    await expect(page.getByText("وصل طلبك إلى الصيدلية")).toBeVisible();
    await expect(page.getByText("تتحدّث هذه الصفحة تلقائياً")).toBeVisible();
    await expect(page.getByRole("link", { name: "تتبّع طلباً آخر" })).toHaveAttribute(
      "href",
      "/orders/track",
    );
    const number = (await page.getByTestId("order-number").textContent())?.trim() ?? "";
    expect(number).toMatch(/^O-\d{4}$/);
    const orderUrl = page.url();

    await page.goto("/orders/track");
    await page.getByLabel("رقم الطلب").fill(number);
    await page.getByLabel("رقم الهاتف").fill("0999999999");
    await page.getByRole("button", { name: "عرض الطلب" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "✕ لا يوجد طلب بهذه البيانات.",
    );
    await page.getByLabel("رقم الهاتف").fill(PHONE);
    await page.getByRole("button", { name: "عرض الطلب" }).click();
    await expect(page).toHaveURL(orderUrl);
  });

  test("without permission to locate, the typed address is enough", async ({ page, context }) => {
    await context.clearPermissions();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition: (_ok: unknown, fail: () => void) => fail(),
        },
      });
    });
    await page.goto("/checkout?rx=par-500");
    await page.getByLabel("الاسم").fill("خالد");
    await page.getByLabel("رقم الهاتف").fill("0955555555");
    await page.getByLabel("موقعك").fill("بحري — الدروشاب");
    await page.getByRole("button", { name: "استخدم موقعي الحالي" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "تعذّر تحديد الموقع" })).toBeVisible();
    await page.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "إرسال الطلب" })).toBeEnabled();
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
    await expect(page.getByText("الخرطوم — الرياض، قرب مسجد النور")).toBeVisible();
    await expect(page.getByRole("link", { name: "فتح الخريطة" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps?q=15.500654,32.559899",
    );
    // The number the customer typed (0912345678) becomes a WhatsApp chat with the message ready.
    await expect(page.getByRole("link", { name: /واتساب/ }).first()).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/249912345678\?text=.+/,
    );
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
