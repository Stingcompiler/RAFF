"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { Panel } from "@/components/ui/Panel";
import { apiSend } from "@/lib/api/browser";
import type { DeviceInfo, Me } from "@/lib/api/types";
import { cn } from "@/lib/cn";

const field =
  "h-[44px] rounded-[8px] border border-line bg-bg px-[12px] py-0 text-[14px] font-normal text-ink outline-none disabled:opacity-100 focus:border-primary focus:shadow-[0_0_0_3px_var(--color-focus)]";
const select = cn(field, "box-content appearance-none disabled:text-muted");
const primary =
  "h-[48px] cursor-pointer rounded-[10px] border-0 bg-primary text-[16px] font-semibold text-primary-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-muted";
const label = "grid gap-[4px] text-[12px] font-medium text-muted";

type Props = { device: DeviceInfo | null; initialMe: Me | null; next: string };

/** Sign in, then choose branch and counter (Raff Screens › Sign-in). */
export function LoginScreen({ device, initialMe, next }: Props) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const name = (o: { name_ar: string; name_en: string }) =>
    locale === "ar" ? o.name_ar : o.name_en;

  const [me, setMe] = useState<Me | null>(initialMe);
  const [username, setUsername] = useState(initialMe?.user.username ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"login" | "context" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(
    initialMe?.branch?.id ?? initialMe?.branches[0]?.id ?? "",
  );
  const [deviceId, setDeviceId] = useState(initialMe?.device?.id ?? "");

  const counters = (me?.counters ?? []).filter((c) => c.branch === branchId);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy("login");
    setError(null);
    const res = await apiSend<Me>("POST", "/auth/login/", { username, password });
    setBusy(null);
    if (!res.ok) {
      setError(res.status === 0 || res.status >= 500 ? t("unreachable") : t("invalid"));
      return;
    }
    setMe(res.data);
    setBranchId(res.data.branch?.id ?? res.data.branches[0]?.id ?? "");
    setDeviceId(res.data.device?.id ?? "");
  }

  async function chooseContext(e: FormEvent) {
    e.preventDefault();
    setBusy("context");
    setError(null);
    const res = await apiSend<Me>("POST", "/auth/context/", {
      branch_id: branchId,
      device_id: deviceId || null,
    });
    if (!res.ok) {
      setBusy(null);
      setError(t("notAllowed"));
      return;
    }
    // Cashiers at a counter land on the POS (BACKLOG: the design has no POS entry in the sidebar).
    const pos = next === "/dashboard" && res.data.device && res.data.role?.code === "cashier";
    router.push(pos ? "/pos" : next);
    router.refresh();
  }

  const signedIn = me !== null;
  const foot =
    device?.registered && device.device && device.branch
      ? t("deviceLine", {
          device: name(device.device),
          city: (locale === "ar" ? device.branch.city_ar : device.branch.city_en) ?? "",
        })
      : t("deviceUnregistered");

  return (
    <main className="flex min-h-dvh flex-col gap-[16px] bg-bg p-[24px] text-ink">
      <div className="grid grid-cols-12 items-start gap-[16px]">
        <div className="col-span-3 max-[760px]:hidden" />
        <section className="col-span-6 min-w-0 max-[760px]:col-span-12">
          <Panel title={t("signInTitle")}>
            <form onSubmit={signIn} className="grid gap-[12px] p-[16px]">
              <label className={label}>
                {t("username")}
                <input
                  dir="ltr"
                  name="username"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={field}
                />
              </label>
              <label className={label}>
                {t("password")}
                <input
                  dir="ltr"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={field}
                />
              </label>
              {/* Signing in again (e.g. another user) is allowed at any point. */}
              <button type="submit" disabled={busy !== null} className={primary}>
                {busy === "login" ? t("signingIn") : t("signIn")}
              </button>
              {error && !signedIn ? (
                <div role="alert" className="text-[12px] font-medium text-danger">
                  {error}
                </div>
              ) : (
                <div className="text-[12px] text-muted">{foot}</div>
              )}
            </form>
          </Panel>
        </section>
        <div className="col-span-3 max-[760px]:hidden" />
        <div className="col-span-3 max-[760px]:hidden" />
        <section className="col-span-6 min-w-0 max-[760px]:col-span-12">
          <Panel title={t("contextTitle")}>
            <form onSubmit={chooseContext} className="grid gap-[12px] p-[16px]">
              <label className={label}>
                {t("branch")}
                <select
                  aria-label={t("branch")}
                  name="branch"
                  value={branchId}
                  disabled={!signedIn}
                  onChange={(e) => {
                    setBranchId(e.target.value);
                    setDeviceId("");
                  }}
                  className={select}
                >
                  {!signedIn && <option value="">{t("signInFirst")}</option>}
                  {me?.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {name(b)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                {t("counter")}
                <select
                  aria-label={t("counter")}
                  name="counter"
                  value={deviceId}
                  disabled={!signedIn}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className={select}
                >
                  <option value="">{t("noCounter")}</option>
                  {counters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {name(c)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={!signedIn || !branchId || busy !== null}
                className={primary}
              >
                {busy === "context" ? t("continuing") : t("continue")}
              </button>
              {error && signedIn ? (
                <div role="alert" className="text-[12px] font-medium text-danger">
                  {error}
                </div>
              ) : (
                <div className="text-[12px] text-muted" />
              )}
            </form>
          </Panel>
        </section>
        <div className="col-span-3 max-[760px]:hidden" />
      </div>
    </main>
  );
}
