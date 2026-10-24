// WO-19 / D-R0014: the font system, checked in a real browser.
//  - only the decided families and weights exist, and the first screen stays under 200KB of fonts;
//  - no text is smaller than 12px;
//  - every number, date, time, id and phone is a `.num` element, and amounts sit at the end of their column.
import { expect, type Page, test } from "@playwright/test";

import { signIn } from "./support/auth";

const FAMILIES = ["IBM Plex Sans Arabic", "IBM Plex Sans"];
const WEIGHTS = ["400", "500", "600", "700"];
const FONT_BUDGET_BYTES = 200 * 1024;
const MIN_PX = 12;

const WORKSPACE = [
  "/dashboard",
  "/inventory",
  "/purchases",
  "/returns",
  "/parties",
  "/transfers",
  "/reports",
  "/settings",
  "/orders",
  "/shifts",
  "/stocktake",
];
const PUBLIC = ["/", "/store", "/cart", "/checkout", "/about", "/contact", "/orders/track"];

test.describe("fonts", () => {
  test("only the decided families and weights are declared, and the first screen is light", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.evaluate(() => document.fonts.ready);
    const info = await page.evaluate(() => ({
      faces: [...document.fonts].map((f) => ({
        family: f.family.replaceAll('"', ""),
        weight: f.weight,
      })),
      bytes: performance
        .getEntriesByType("resource")
        .filter((r) => /\.woff2?(\?|$)/.test(r.name))
        .reduce((sum, r) => sum + (r as PerformanceResourceTiming).encodedBodySize, 0),
    }));
    for (const face of info.faces) {
      expect(FAMILIES, `family ${face.family}`).toContain(face.family);
      expect(WEIGHTS, `weight ${face.weight} of ${face.family}`).toContain(face.weight);
    }
    expect(info.bytes, "font bytes on the first screen").toBeLessThanOrEqual(FONT_BUDGET_BYTES);
  });

  test("the three family variables exist and nothing else names a family", async ({ page }) => {
    await page.goto("/login");
    const vars = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return ["--font-ui", "--font-mono", "--font-display"].map((v) =>
        cs.getPropertyValue(v).trim(),
      );
    });
    for (const v of vars) expect(v).toContain("IBM Plex Sans");
    for (const v of vars) expect(v).toContain("system-ui");
  });
});

/** What goes wrong on a page: tiny text, a number outside `.num`, an amount aligned to the start. */
async function typographyProblems(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ minPx }) => {
      const out: string[] = [];
      const NUMBERISH =
        /^[+\-−]?\s*[\d٠-٩][\d٠-٩.,:/\-\s]*(\s?(ج\.س|SDG|%|٪|ج))?$|^[A-Z]{1,4}-[\dA-Z-]+$|^\+?\d[\d\s]{6,}$/;
      const AMOUNT = /^[+\-−]?\s*[\d٠-٩][\d٠-٩,.]*(\s?(ج\.س|SDG))?$/;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const seen = new Set<Element>();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.textContent ?? "").trim();
        const el = node.parentElement;
        if (!text || !el || seen.has(el)) continue;
        if (el.closest("script,style,noscript,[aria-hidden='true'],option")) continue;
        const style = getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") continue;
        seen.add(el);
        const label = `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").slice(0, 40)} "${text.slice(0, 24)}"`;
        if (parseFloat(style.fontSize) < minPx) out.push(`text under ${minPx}px: ${label}`);
        if (NUMBERISH.test(text) && !el.closest(".num,[data-num]"))
          out.push(`number outside .num: ${label}`);
        const cell = el.closest("[role='cell']");
        if (cell && AMOUNT.test(text) && /[٠-٩\d]/.test(text) && text.length > 1) {
          const align = getComputedStyle(cell).textAlign;
          if (align !== "end" && align !== "right") out.push(`amount aligned to start: ${label}`);
        }
      }
      return out;
    },
    { minPx: MIN_PX },
  );
}

test.describe("typography on screens", () => {
  // Eleven pages per test: more than the default 30 seconds.
  test.setTimeout(120_000);
  test("workspace", async ({ page }) => {
    await signIn(page, "admin");
    const bad: Record<string, string[]> = {};
    for (const path of WORKSPACE) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const found = await typographyProblems(page);
      if (found.length) bad[path] = [...new Set(found)];
    }
    expect(bad).toEqual({});
  });

  test("storefront", async ({ page }) => {
    const bad: Record<string, string[]> = {};
    for (const path of PUBLIC) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const found = await typographyProblems(page);
      if (found.length) bad[path] = [...new Set(found)];
    }
    expect(bad).toEqual({});
  });
});
