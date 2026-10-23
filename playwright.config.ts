import { defineConfig, devices } from "@playwright/test";

// Own ports so the test stack never collides with `make dev` or other local servers.
const API_PORT = 8100;
const WEB_PORT = 3100;

// Test-only values: a fixed organization for the seeded sample data, and an
// 8-character demo password (the sign-in reference shows eight dots).
export const TEST_ORG_ID = "6f1d3c2a-5b7e-4c1d-9a8f-2e4b6c8d0a12";
export const DEMO_PASSWORD = "Raff2026";

const backendEnv = {
  DJANGO_SETTINGS_MODULE: "config.settings.dev",
  DJANGO_SECRET_KEY: process.env.DJANGO_SECRET_KEY ?? "e2e-only-not-a-secret",
  POSTGRES_HOST: process.env.POSTGRES_HOST ?? "localhost",
  POSTGRES_PORT: process.env.POSTGRES_PORT ?? "5432",
  POSTGRES_DB: process.env.POSTGRES_DB ?? "raff",
  POSTGRES_USER: process.env.POSTGRES_USER ?? "raff",
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? "",
  SINGLE_ORG_ID: TEST_ORG_ID,
  // The design's "today": expiry statuses and dates match the reference shots.
  RAFF_FIXED_TODAY: process.env.RAFF_FIXED_TODAY ?? "2026-10-22",
  RAFF_DEMO_PASSWORD: DEMO_PASSWORD,
  // Every journey signs in from 127.0.0.1; the production rate (30/min) would throttle them.
  RAFF_THROTTLE_LOGIN: "10000/min",
};

export default defineConfig({
  testDir: "tests/e2e",
  // Linux baselines (from CI) are committed; macOS ones are local and gitignored.
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{platform}{ext}",
  fullyParallel: true,
  // One dev server answers every worker; more than three locally only adds queueing.
  workers: process.env.CI ? undefined : 3,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: "en-US",
    timezoneId: "Africa/Khartoum",
    trace: "retain-on-failure",
  },
  expect: {
    // Postings run real transactions on a single dev server; 5 s is tight under parallel load.
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled", caret: "hide" },
  },
  projects: [
    {
      name: "e2e",
      testMatch: "journeys/**/*.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "visual",
      testMatch: "visual.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: [
    {
      command:
        "uv run --directory backend python manage.py migrate --noinput && " +
        "uv run --directory backend python manage.py seed_demo && " +
        `uv run --directory backend python manage.py runserver 127.0.0.1:${API_PORT} --noreload`,
      url: `http://127.0.0.1:${API_PORT}/api/v1/health/`,
      env: { ...backendEnv, DJANGO_CSRF_TRUSTED_ORIGINS: `http://localhost:${WEB_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm --dir frontend exec next start --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/`,
      env: { RAFF_API_ORIGIN: `http://127.0.0.1:${API_PORT}`, RAFF_DEV_ROUTES: "1" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
