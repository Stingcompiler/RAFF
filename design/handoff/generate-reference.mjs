#!/usr/bin/env node
// Generate reference screenshots from the approved design files.
//
//   node design/handoff/generate-reference.mjs            # every shot
//   node design/handoff/generate-reference.mjs --only "Raff POS"
//   node design/handoff/generate-reference.mjs --list     # print the shot list
//
// Output: design/handoff/reference/{file}/{state}-{locale}-{theme}-{width}.png
// plus reference/manifest.json. Fully offline: React, React DOM and Babel come
// from node_modules, Google Fonts are replaced by local @fontsource files, and
// every other external request is blocked. See design/handoff/README.md.

import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

const require = createRequire(import.meta.url);
const HANDOFF_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HANDOFF_DIR, "reference");

// ---------------------------------------------------------------------------
// Local server

const pkgDir = (name) => path.dirname(require.resolve(`${name}/package.json`));
const VENDOR = {
  "react.js": path.join(pkgDir("react"), "umd/react.production.min.js"),
  "react-dom.js": path.join(pkgDir("react-dom"), "umd/react-dom.production.min.js"),
  "babel.js": path.join(pkgDir("@babel/standalone"), "babel.min.js"),
};
const FONT_PACKAGES = {
  "ibm-plex-sans": pkgDir("@fontsource/ibm-plex-sans"),
  "ibm-plex-sans-arabic": pkgDir("@fontsource/ibm-plex-sans-arabic"),
};
const FONT_WEIGHTS = [400, 500, 600, 700];

// CDN URLs hard-coded in support.js; support.js looks them up in window.__resources first.
const CDN_TO_VENDOR = {
  "https://unpkg.com/react@18.3.1/umd/react.production.min.js": "react.js",
  "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js": "react-dom.js",
  "https://unpkg.com/@babel/standalone@7.29.0/babel.min.js": "babel.js",
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
};

function fontsCss(origin) {
  return Object.keys(FONT_PACKAGES)
    .flatMap((pkg) =>
      FONT_WEIGHTS.map((w) => `@import url("${origin}/fontsource/${pkg}/${w}.css");`),
    )
    .join("\n");
}

function sendFile(res, file) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
}

export async function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
    if (parts.includes("..")) return res.writeHead(400).end();
    const [head, ...rest] = parts;
    if (head === "vendor" && VENDOR[rest[0]]) return sendFile(res, VENDOR[rest[0]]);
    if (head === "fontsource" && FONT_PACKAGES[rest[0]]) {
      return sendFile(res, path.join(FONT_PACKAGES[rest[0]], ...rest.slice(1)));
    }
    return sendFile(res, path.join(HANDOFF_DIR, ...parts));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://localhost:${server.address().port}`;
  return { origin, close: () => new Promise((resolve) => server.close(resolve)) };
}

export async function preparePage(page, origin, blocked) {
  const resources = Object.fromEntries(
    Object.entries(CDN_TO_VENDOR).map(([cdn, file]) => [cdn, `${origin}/vendor/${file}`]),
  );
  await page.addInitScript((r) => {
    window.__resources = r;
  }, resources);
  await page.route(
    (url) => !url.href.startsWith(origin),
    (route) => {
      const url = route.request().url();
      if (url.startsWith("https://fonts.googleapis.com/")) {
        return route.fulfill({ status: 200, contentType: "text/css", body: fontsCss(origin) });
      }
      blocked.add(url);
      return route.abort();
    },
  );
}

// ---------------------------------------------------------------------------
// Shot list (the table in WO-00). Steps run in Arabic (each file's default),
// then the locale and theme are switched with the template bar, which keeps
// the current view.

const bar = (name) => ({ bar: name });
const text = (value, within) => ({ text: value, within });
const button = (name) => ({ button: name });

const AR_LIGHT_EN_DARK = [
  ["ar", "light"],
  ["en", "dark"],
];
const AR_EN = [
  ["ar", "light"],
  ["en", "light"],
];

const POS_STATES = [
  ["pos", [bar("POS")]],
  ["payment", [bar("Payment")]],
  ["payment-bank", [bar("Payment"), text("بنكي")]],
  ["payment-credit", [bar("Payment"), text("آجل")]],
  ["payment-split", [bar("Payment"), text("منقسم")]],
  ["from-order", [bar("من طلب متجر")]],
  ["reconnecting", [bar("Reconnecting")]],
  ["server-offline", [bar("Server offline")]],
  ["approving", [bar("Approving")]],
  ["verifying", [bar("Verifying")]],
  ["approved", [bar("Approved")]],
  ["held-sales", [bar("Held sales")]],
  ["empty-cart", [bar("Empty cart")]],
  ["no-results", [bar("No results")]],
  ["batches", [bar("Batches")]],
  ["approval-failed", [bar("Approval failed")]],
  ["shift-closed", [bar("Shift closed")]],
];

const nav = (label) => text(label, "nav");
const order = (id) => [nav("الطلبات"), text(id)];
const SCREENS_STATES = [
  ["dashboard", [nav("المتابعة")]],
  ["orders", [nav("الطلبات")]],
  ["inventory", [nav("الأصناف والمخزون")]],
  ["purchases", [nav("المشتريات")]],
  ["returns", [nav("المرتجعات والحجر")]],
  ["stocktake", [nav("الجرد")]],
  ["shifts", [nav("الورديات والخزينة")]],
  ["parties", [nav("العملاء والموردون")]],
  ["transfers", [nav("التحويلات")]],
  ["reports", [nav("التقارير")]],
  ["settings", [nav("الإعدادات")]],
  ["storefront-settings", [nav("الإعدادات"), button("المتجر")]],
  ["storefront-catalog", [nav("الإعدادات"), button("الكتالوج المنشور")]],
  ["login", [bar("الدخول")]],
  ["order-new", order("O-1042")],
  ["order-needs-contact", order("O-1043")],
  ["order-confirmed", order("O-1041")],
  ["order-preparing", order("O-1040")],
  ["order-ready", order("O-1039")],
  ["order-completed", order("O-1038")],
  ["order-cancelled", order("O-1036")],
];

const MOBILE_STATES = [
  ["default", 390, []],
  ["default", 360, [bar("360")]],
  ["default", 412, [bar("412")]],
  ["keyboard", 390, [bar("لوحة المفاتيح")]],
  ["camera-denied", 390, [bar("الكاميرا مرفوضة")]],
];

const toCheckout = [button(/^السلة/), button("إرسال الطلب")];
const fillCheckout = [
  { fill: ["الاسم", "سلمى أحمد"] },
  { fill: ["09XXXXXXXX", "0912345678", "placeholder"] },
  { check: "#sf-agree" },
];
const submitWith = (sim, ms) => [
  bar(sim),
  ...toCheckout,
  ...fillCheckout,
  { installClock: true },
  button("إرسال الطلب"),
  ...(ms ? [{ runClock: ms }] : []),
];
const STOREFRONT_STATES = [
  ["home", []],
  ["store", [text("المتجر", "header")]],
  ["product", [text("المتجر", "header"), text("باراسيتامول 500 mg")]],
  ["product-rx", [text("المتجر", "header"), text("أموكسيسيلين 500 mg")]],
  ["cart", [button(/^السلة/)], [bar("Mobile 390"), text("السلة · 3")]],
  ["checkout-idle", toCheckout],
  ["checkout-sending", submitWith("Submit: ok", 0)],
  ["checkout-failed", submitWith("Submit: fail", 1200)],
  ["checkout-verifying", submitWith("Submit: timeout", 1200)],
  ["checkout-success", submitWith("Submit: ok", 1200)],
  [
    "order",
    [
      text("تتبّع طلب", "header"),
      { fill: ["رقم الطلب", "O-1041"] },
      { fill: ["09XXXXXXXX", "0923456789", "placeholder"] },
      button("عرض الطلب"),
    ],
  ],
  ["track", [text("تتبّع طلب", "header")]],
  ["about", [text("عن الصيدلية", "header")]],
  ["contact", [text("تواصل", "header")]],
  ["policy", [text("سياسة الخصوصية والطلبات", "footer")]],
];

/**
 * `stepsFor(width, steps, mobileSteps)` lets a file adapt the steps per width;
 * a state may carry its own steps for the narrow width as a third element.
 */
function shotsFor(file, slug, states, variants, widths, stepsFor = (w, steps) => steps) {
  return states.flatMap(([state, steps, narrowSteps]) =>
    variants.flatMap(([locale, theme]) =>
      widths.map((width) => ({
        file,
        slug,
        state,
        locale,
        theme,
        width,
        viewport: width,
        steps: stepsFor(width, steps, narrowSteps),
      })),
    ),
  );
}

const SHOTS = [
  ...shotsFor("Raff POS", "raff-pos", POS_STATES, AR_LIGHT_EN_DARK, [1440, 1366]),
  ...shotsFor("Raff Screens", "raff-screens", SCREENS_STATES, AR_LIGHT_EN_DARK, [1440]),
  ...MOBILE_STATES.flatMap(([state, width, steps]) =>
    AR_LIGHT_EN_DARK.map(([locale, theme]) => ({
      file: "Raff Mobile",
      slug: "raff-mobile",
      state,
      locale,
      theme,
      width,
      viewport: 1440,
      steps,
    })),
  ),
  // Mobile 390 hides the header links, so states are reached in desktop mode
  // and the mode is switched last (switching keeps the current view).
  ...shotsFor(
    "Storefront",
    "storefront",
    STOREFRONT_STATES,
    AR_EN,
    [1280, 390],
    (w, steps, narrow) => (w === 390 ? (narrow ?? [...steps, bar("Mobile 390")]) : steps),
  ).map((shot) => ({ ...shot, viewport: 1280, unroll: true })),
  ...shotsFor("Raff Components", "raff-components", [["default", []]], AR_EN, [1440]),
  ...shotsFor("Raff Landing", "raff-landing", [["default", []]], AR_EN, [1440, 390]),
];

// Files whose template bar has theme buttons; the others render light only.
const HAS_THEME = new Set(["Raff POS", "Raff Screens", "Raff Mobile"]);

// ---------------------------------------------------------------------------
// Runner

async function runStep(page, step) {
  if (step.bar) {
    await page.locator("[data-ref-bar] button").getByText(step.bar, { exact: true }).click();
  } else if (step.text) {
    const scope = step.within ? page.locator(step.within).first() : page;
    await scope.getByText(step.text, { exact: true }).first().click();
  } else if (step.button) {
    await page
      .getByRole("button", { name: step.button, exact: true })
      .filter({ visible: true })
      .first()
      .click();
  } else if (step.fill) {
    const [label, value, by] = step.fill;
    await (
      by === "placeholder" ? page.getByPlaceholder(label) : page.getByLabel(label, { exact: true })
    )
      .filter({ visible: true })
      .first()
      .fill(value);
  } else if (step.check) {
    await page.locator(step.check).check();
  } else if (step.installClock) {
    // Freeze time so in-flight states (sending, verifying) hold until runClock.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
  } else if (step.runClock) {
    await page.clock.runFor(step.runClock);
  }
  await page.waitForTimeout(150);
}

/** Tag the prototype's template bar (the strip saying "sample data") so we can drive and hide it. */
async function tagTemplateBar(page) {
  await page.evaluate(() => {
    const label = [...document.querySelectorAll("span")].find((s) =>
      s.textContent?.includes("sample data"),
    );
    label?.parentElement?.setAttribute("data-ref-bar", "");
  });
}

/**
 * The storefront draws each mode in a fixed-height frame (1280×900 desktop,
 * a 390px phone) whose screen scrolls internally. Unroll that screen to its
 * full height so the reference equals a full-page capture at that width.
 */
async function unrollScreen(page, width) {
  const found = await page.evaluate((w) => {
    const screen = [...document.querySelectorAll("body *")].find((el) => {
      const cs = getComputedStyle(el);
      return el.clientWidth === w && /auto|scroll/.test(cs.overflowY);
    });
    if (!screen) return false;
    screen.setAttribute("data-ref-screen", "");
    // Never shorter than the frame, like a page is never shorter than its viewport.
    screen.style.minHeight = `${screen.clientHeight}px`;
    return true;
  }, width);
  if (!found) throw new Error(`no scrolling ${width}px screen found`);
  await page.addStyleTag({
    content:
      "[data-ref-screen]{height:auto!important;max-height:none!important;overflow:visible!important;" +
      "border-width:0!important;border-radius:0!important;box-shadow:none!important}",
  });
  return page.locator("[data-ref-screen]");
}

async function setLocaleAndTheme(page, shot) {
  const lang = shot.locale === "ar" ? "العربية" : "English";
  const hasBar = (await page.locator("[data-ref-bar]").count()) > 0;
  if (hasBar) {
    await runStep(page, bar(lang));
    if (HAS_THEME.has(shot.file))
      await runStep(page, bar(shot.theme === "dark" ? "Dark" : "Light"));
  } else {
    // Landing: the language switch is part of the page itself.
    await page.getByText(lang, { exact: true }).first().click();
  }
}

function outPath(shot) {
  return path.join(
    OUT_DIR,
    shot.slug,
    `${shot.state}-${shot.locale}-${shot.theme}-${shot.width}.png`,
  );
}

async function capture(browser, origin, shot) {
  const context = await browser.newContext({
    viewport: { width: shot.viewport, height: 900 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "Africa/Khartoum",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const blocked = new Set();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await preparePage(page, origin, blocked);
    await page.goto(`${origin}/${encodeURIComponent(shot.file)}.dc.html`);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.querySelector("x-dc")?.children.length !== 0);
    await page.evaluate(() => document.fonts.ready);
    await tagTemplateBar(page);
    for (const step of shot.steps) await runStep(page, step);
    await setLocaleAndTheme(page, shot);
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: "[data-ref-bar]{display:none!important}" });
    await page.waitForTimeout(400);
    const file = outPath(shot);
    mkdirSync(path.dirname(file), { recursive: true });
    const options = { path: file, animations: "disabled", caret: "hide" };
    if (shot.unroll) await (await unrollScreen(page, shot.width)).screenshot(options);
    else await page.screenshot({ ...options, fullPage: true });
    if (blocked.size) throw new Error(`external requests blocked: ${[...blocked].join(", ")}`);
    if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);
    return null;
  } catch (error) {
    rmSync(outPath(shot), { force: true });
    if (process.env.DEBUG) console.error(error);
    return error instanceof Error ? error.message.split("\n")[0] : String(error);
  } finally {
    await context.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
  const only = flag("--only");
  const state = flag("--state");
  const shots = SHOTS.filter((s) => (!only || s.file === only) && (!state || s.state === state));
  if (args.includes("--list")) {
    for (const s of shots) console.log(path.relative(HANDOFF_DIR, outPath(s)));
    return;
  }

  if (!state) {
    for (const slug of new Set(shots.map((s) => s.slug))) {
      rmSync(path.join(OUT_DIR, slug), { recursive: true, force: true });
    }
  }

  const server = await startServer();
  const browser = await chromium.launch();
  const failures = [];
  const queue = [...shots];
  const worker = async () => {
    for (let shot = queue.shift(); shot; shot = queue.shift()) {
      const error = await capture(browser, server.origin, shot);
      const name = path.relative(HANDOFF_DIR, outPath(shot));
      if (error) failures.push({ shot: name, error });
      console.log(`${error ? "FAIL" : "ok  "} ${name}${error ? ` — ${error}` : ""}`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  await browser.close();
  await server.close();

  if (!only && !state) {
    const manifest = SHOTS.map(({ file, slug, state, locale, theme, width }) => ({
      design: `${file}.dc.html`,
      state,
      locale,
      theme,
      width,
      png: path.relative(HANDOFF_DIR, outPath({ slug, state, locale, theme, width })),
      generated: !failures.some((f) =>
        f.shot.endsWith(`${slug}/${state}-${locale}-${theme}-${width}.png`),
      ),
    }));
    writeFileSync(path.join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  }

  console.log(`\n${shots.length - failures.length}/${shots.length} reference shots generated.`);
  if (failures.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
