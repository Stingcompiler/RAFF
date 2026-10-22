import { expect, type Page } from "@playwright/test";

import { DEMO_PASSWORD } from "../../../playwright.config";

/** Sign in through the API (same cookies as the browser) and pick the default context. */
export async function signIn(page: Page, username: string, password = DEMO_PASSWORD) {
  await page.request.get("/api/v1/auth/csrf/");
  const csrf = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
  const login = await page.request.post("/api/v1/auth/login/", {
    data: { username, password },
    headers: { "x-csrftoken": csrf },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const me = await login.json();
  if (!me.branch) {
    const token = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
    const ctx = await page.request.post("/api/v1/auth/context/", {
      data: { branch_id: me.branches[0].id, device_id: null },
      headers: { "x-csrftoken": token },
    });
    expect(ctx.ok()).toBe(true);
  }
  return me;
}

/** Register this browser as a counter (as the owner), returning the device cookie value. */
export async function registerCounter(page: Page, nameEn = "Counter 1", branchCode = "KRT") {
  await signIn(page, "admin");
  const devices = await (await page.request.get("/api/v1/devices/")).json();
  const branches = await (await page.request.get("/api/v1/branches/")).json();
  const branch = branches.find((b: { code: string }) => b.code === branchCode);
  const device = devices.find(
    (d: { name_en: string; branch: string }) => d.name_en === nameEn && d.branch === branch.id,
  );
  const csrf = (await page.context().cookies()).find((c) => c.name === "csrftoken")?.value ?? "";
  const res = await page.request.post(`/api/v1/devices/${device.id}/register/`, {
    headers: { "x-csrftoken": csrf },
  });
  expect(res.ok()).toBe(true);
  // Keep only the device cookie: the caller starts signed out.
  const cookies = (await page.context().cookies()).filter((c) => c.name === "raff_device");
  await page.context().clearCookies();
  await page.context().addCookies(cookies);
}
