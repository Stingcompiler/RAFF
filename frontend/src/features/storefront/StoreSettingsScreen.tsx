"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Select, TextInput, Textarea } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/api/browser";
import type { Branch, Schemas } from "@/lib/api/types";
import { cn } from "@/lib/cn";

type Settings = Schemas["Settings"];
type TextKey =
  | "name_ar"
  | "name_en"
  | "hero_title_ar"
  | "hero_title_en"
  | "address_ar"
  | "address_en"
  | "hours"
  | "whatsapp"
  | "telegram_chat_id";
type LongKey = "hero_lead_ar" | "hero_lead_en" | "about_ar" | "about_en" | "blocked_phones";
const LABEL = "grid gap-[4px] text-[12px] font-medium text-text-muted";

/** Storefront settings (§5.4): identity, contact, pickup branch, limits. */
export function StoreSettingsScreen({
  initial,
  branches,
}: {
  initial: Settings;
  branches: Branch[];
}) {
  const t = useTranslations("storeAdmin");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setS((prev) => ({ ...prev, [key]: value }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await apiSend<Settings>("PUT", "/storefront/settings/", s);
    setBusy(false);
    if (res.ok) {
      setS(res.data);
      toast.push("success", t("saved"));
    } else {
      const code = typeof res.error?.detail === "string" ? res.error.detail : "";
      toast.push(
        "danger",
        code === "branch_required" ? t("errors.branch_required") : t("errors.failed"),
      );
    }
  };
  const text = (key: TextKey, label: string, ltr = false) => (
    <label className={LABEL}>
      {label}
      <TextInput
        dir={ltr ? "ltr" : undefined}
        value={s[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const long = (key: LongKey, label: string, ltr = false) => (
    <label className={LABEL}>
      {label}
      <Textarea
        dir={ltr ? "ltr" : undefined}
        rows={3}
        value={s[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );

  return (
    <form onSubmit={save}>
      <PageHeader
        title={t("setT")}
        actions={
          <Button type="submit" disabled={busy}>
            {t("save")}
          </Button>
        }
      />
      <div className="grid grid-cols-2 items-start gap-[16px] max-[1180px]:grid-cols-1">
        <Panel>
          <div className="grid gap-[16px] p-[20px]">
            <div className="flex items-center justify-between gap-[12px]">
              <div>
                <div className="font-medium">{t("enable")}</div>
                <div className="text-[13px] text-text-muted">{t("enableD")}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(s.enabled)}
                aria-label={t("enable")}
                onClick={() => set("enabled", !s.enabled)}
                className={cn(
                  "relative h-[24px] w-[42px] flex-none cursor-pointer rounded-full border-0 p-0",
                  s.enabled ? "bg-brand" : "bg-border-strong",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] size-[18px] rounded-full bg-surface transition-[inset-inline-start] duration-(--motion-feedback)",
                    s.enabled ? "start-[21px]" : "start-[3px]",
                  )}
                />
              </button>
            </div>
            <label className={LABEL}>
              {t("branch")}
              <Select
                value={s.branch ?? ""}
                onChange={(e) => set("branch", e.target.value || null)}
              >
                <option value="" />
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {ar ? b.name_ar : b.name_en}
                  </option>
                ))}
              </Select>
            </label>
            <label className={LABEL}>
              {t("brandC")}
              <input
                type="color"
                aria-label={t("brandC")}
                value={s.brand_color ?? ""}
                onChange={(e) => set("brand_color", e.target.value)}
                className="h-[40px] w-[80px] cursor-pointer rounded-control border border-border-strong bg-surface"
              />
            </label>
            {text("name_ar", t("nameAr"))}
            {text("name_en", t("nameEn"), true)}
            {text("hero_title_ar", t("heroAr"))}
            {text("hero_title_en", t("heroEn"), true)}
            {long("hero_lead_ar", t("leadAr"))}
            {long("hero_lead_en", t("leadEn"), true)}
          </div>
        </Panel>
        <div className="grid gap-[16px]">
          <Panel>
            <div className="grid gap-[16px] p-[20px]">
              {text("address_ar", t("addrAr"))}
              {text("address_en", t("addrEn"), true)}
              {text("hours", t("hours"), true)}
              {text("whatsapp", t("wa"), true)}
              {long("about_ar", t("aboutAr"))}
              {long("about_en", t("aboutEn"), true)}
            </div>
          </Panel>
          <Panel title={t("limits")}>
            <div className="grid gap-[16px] p-[20px]">
              <label className={LABEL}>
                {t("perHour")}
                <TextInput
                  dir="ltr"
                  type="number"
                  min={1}
                  value={s.orders_per_hour ?? 10}
                  onChange={(e) => set("orders_per_hour", Number(e.target.value))}
                />
              </label>
              {long("blocked_phones", t("blocked"), true)}
              {text("telegram_chat_id", t("telegram"), true)}
            </div>
          </Panel>
        </div>
      </div>
    </form>
  );
}
