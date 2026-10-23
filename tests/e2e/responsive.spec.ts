import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./support/auth";

// Every screen must fit the viewport at phone, small-phone and tablet widths: nothing runs
// off the edge, and neither the page nor the app's scroll area moves sideways. Tables scroll
// inside their own card and are the only intended exception.
const WIDTHS = [320, 390, 768] as const;
const WORKSPACE = [
  "/dashboard",
  "/inventory",
  "/purchases",
  "/purchases/new",
  "/returns",
  "/stocktake",
  "/shifts",
  "/parties",
  "/transfers",
  "/reports",
  "/settings",
  "/orders",
  "/storefront/catalog",
];
const PUBLIC = ["/store", "/cart", "/checkout", "/orders/track", "/about", "/contact"];

/** What goes beyond the screen: the scroll area, or a control the user can no longer reach. */
async function overflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const width = window.innerWidth;
    if (document.documentElement.scrollWidth > width + 1) out.push("page scrolls sideways");
    const main = document.querySelector("main");
    if (main && main.scrollWidth > main.clientWidth + 1) out.push("main scrolls sideways");
    const insideScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const x = getComputedStyle(p).overflowX;
        if (x === "auto" || x === "scroll") return p.tagName !== "MAIN";
      }
      return false;
    };
    const controls = document.querySelectorAll("button, a[href], input, select, textarea");
    for (const el of controls) {
      if (el.closest("nav[aria-label], aside")) continue; // the drawer waits off-screen
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || insideScroller(el)) continue;
      if (r.right > width + 1 || r.left < -1) {
        const name = (el.getAttribute("aria-label") || el.textContent || el.tagName).trim();
        out.push(`${name.slice(0, 30)} spans ${Math.round(r.left)}…${Math.round(r.right)}`);
      }
    }
    return out;
  });
}

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 768 ? 800 : 1024 }, hasTouch: width < 768 });

    test("workspace screens fit", async ({ page }) => {
      await signIn(page, "admin");
      for (const path of WORKSPACE) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(await overflow(page), `${path} at ${width}px`).toEqual([]);
      }
    });

    test("public storefront screens fit", async ({ page }) => {
      for (const path of PUBLIC) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        expect(await overflow(page), `${path} at ${width}px`).toEqual([]);
      }
    });
  });
}

test.describe("dialogs on a phone", () => {
  test.use({ viewport: { width: 390, height: 800 }, hasTouch: true });

  for (const [path, opener] of [
    ["/settings", "مستخدم جديد"],
    ["/transfers", "تحويل جديد"],
  ] as const) {
    test(`${opener} stays inside the screen`, async ({ page }) => {
      await signIn(page, "admin");
      await page.goto(path);
      await page.getByRole("button", { name: opener }).first().click();
      const box = await page.getByRole("dialog").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    });
  }
});
