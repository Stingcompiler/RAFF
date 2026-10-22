import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { expect, type Page, type TestInfo } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const HANDOFF = path.resolve(__dirname, "../../../design/handoff");
// CI (Linux) compares with the canonical Linux shots; on macOS use the local copy
// made by `node design/handoff/generate-reference.mjs --local` when it exists.
const LOCAL = path.join(HANDOFF, "reference-local");
const REFERENCE_DIR =
  process.platform === "darwin" && existsSync(LOCAL) ? LOCAL : path.join(HANDOFF, "reference");

export type Rect = { x: number; y: number; width: number; height: number };

export type ReferenceShot = {
  /** Folder under design/handoff/reference, e.g. "raff-components". */
  file: string;
  state: string;
  locale: "ar" | "en";
  theme: "light" | "dark";
  width: number;
};

type Options = {
  /** Compare only these regions (page coordinates); default: the whole image. */
  regions?: Rect[];
  /** Capture the full scrollable page instead of the viewport. */
  fullPage?: boolean;
  /** Allowed fraction of differing pixels (CLAUDE.md rule 23: 2%). */
  maxDiffRatio?: number;
};

export function referencePath(shot: ReferenceShot) {
  return path.join(
    REFERENCE_DIR,
    shot.file,
    `${shot.state}-${shot.locale}-${shot.theme}-${shot.width}.png`,
  );
}

function crop(png: PNG, r: Rect): PNG {
  const out = new PNG({ width: r.width, height: r.height });
  PNG.bitblt(png, out, r.x, r.y, r.width, r.height, 0, 0);
  return out;
}

/**
 * Compare the page with a reference PNG generated from the design files.
 * References are never written here: only generate-reference.mjs produces them.
 */
export async function expectMatchesReference(
  page: Page,
  testInfo: TestInfo,
  shot: ReferenceShot,
  { regions, fullPage = true, maxDiffRatio = 0.02 }: Options = {},
) {
  await page.evaluate(() => document.fonts.ready);
  const actual = PNG.sync.read(
    await page.screenshot({ fullPage, animations: "disabled", caret: "hide", scale: "css" }),
  );
  const expected = PNG.sync.read(readFileSync(referencePath(shot)));

  const areas = regions ?? [
    {
      x: 0,
      y: 0,
      width: Math.max(actual.width, expected.width),
      height: Math.max(actual.height, expected.height),
    },
  ];
  let total = 0;
  let different = 0;
  for (const [i, area] of areas.entries()) {
    const common = {
      x: area.x,
      y: area.y,
      width: Math.min(area.width, actual.width - area.x, expected.width - area.x),
      height: Math.min(area.height, actual.height - area.y, expected.height - area.y),
    };
    const a = crop(actual, common);
    const e = crop(expected, common);
    const diff = new PNG({ width: common.width, height: common.height });
    const mismatched = pixelmatch(a.data, e.data, diff.data, common.width, common.height, {
      threshold: 0.2,
    });
    // Pixels outside the common area (size mismatch) all count as different.
    const areaPixels = area.width * area.height;
    total += areaPixels;
    different += mismatched + (areaPixels - common.width * common.height);
    if (mismatched > 0 || areaPixels !== common.width * common.height) {
      const name = `${shot.state}-${shot.locale}-${shot.theme}-${shot.width}-r${i}`;
      for (const [kind, img] of [
        ["actual", a],
        ["expected", e],
        ["diff", diff],
      ] as const) {
        const file = testInfo.outputPath(`${name}-${kind}.png`);
        writeFileSync(file, PNG.sync.write(img));
        await testInfo.attach(`${name}-${kind}.png`, { path: file, contentType: "image/png" });
      }
    }
  }
  const ratio = different / total;
  const description = `${path.relative(REFERENCE_DIR, referencePath(shot))}: ${(ratio * 100).toFixed(2)}% (actual ${actual.width}×${actual.height}, reference ${expected.width}×${expected.height})`;
  testInfo.annotations.push({ type: "visual-diff", description });
  console.log(`visual-diff ${description}`);
  expect(ratio, `differing pixels vs ${referencePath(shot)}`).toBeLessThanOrEqual(maxDiffRatio);
}
