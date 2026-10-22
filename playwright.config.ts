import { defineConfig, devices } from "@playwright/test";

const backendEnv = {
  DJANGO_SETTINGS_MODULE: "config.settings.dev",
  DJANGO_SECRET_KEY: process.env.DJANGO_SECRET_KEY ?? "e2e-only-not-a-secret",
  POSTGRES_HOST: process.env.POSTGRES_HOST ?? "localhost",
  POSTGRES_PORT: process.env.POSTGRES_PORT ?? "5432",
  POSTGRES_DB: process.env.POSTGRES_DB ?? "raff",
  POSTGRES_USER: process.env.POSTGRES_USER ?? "raff",
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? "",
};

export default defineConfig({
  testDir: "tests/e2e",
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    locale: "en-US",
    timezoneId: "Africa/Khartoum",
    trace: "retain-on-failure",
  },
  expect: {
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
        "uv run --directory backend python manage.py runserver 127.0.0.1:8000 --noreload",
      url: "http://127.0.0.1:8000/api/v1/health/",
      env: backendEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --dir frontend start",
      url: "http://localhost:3000/",
      env: { RAFF_API_ORIGIN: "http://127.0.0.1:8000" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
