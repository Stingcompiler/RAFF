import { getLocale, getTranslations } from "next-intl/server";

import Link from "next/link";

import { PageHeader } from "@/components/shell/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import {
  AuditPanel,
  DevicesPanel,
  LicensePanel,
  ReceiptPanel,
  SystemTiles,
} from "@/features/settings/SettingsPanels";
import { UsersPanel } from "@/features/users/UsersPanel";
import { serverGet } from "@/lib/api/server";
import type { Branch, Device, DeviceInfo, Role, Schemas, User } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { requireMe } from "@/lib/session";

export default async function SettingsPage() {
  const t = await getTranslations();
  const me = await requireMe();
  const ar = (await getLocale()) === "ar";
  const canUsers = me.permissions.includes("users.manage");
  const canSettings = me.permissions.includes("settings.manage");
  const [users, roles, branches, devices, current, license, events, backup] = await Promise.all([
    canUsers ? serverGet<User[]>("/users/") : null,
    canUsers ? serverGet<Role[]>("/roles/") : null,
    serverGet<Branch[]>("/branches/"),
    canSettings ? serverGet<Device[]>("/devices/") : null,
    serverGet<DeviceInfo>("/auth/device/"),
    serverGet<Schemas["LicenseStatus"]>("/licensing/status/"),
    canSettings ? serverGet<Schemas["AuditEvent"][]>("/audit/events/?limit=30") : null,
    canSettings ? serverGet<Schemas["BackupStatus"]>("/backup/status/") : null,
  ]);
  return (
    <>
      <PageHeader
        title={t("settings.title")}
        actions={
          me.permissions.includes("storefront.manage") && (
            <>
              <Link
                href="/storefront/settings"
                className={cn(buttonClasses({ variant: "outline" }), "no-underline")}
              >
                {t("settings.storefront")}
              </Link>
              <Link
                href="/storefront/catalog"
                className={cn(buttonClasses({ variant: "outline" }), "no-underline")}
              >
                {t("settings.published")}
              </Link>
            </>
          )
        }
      />
      <SystemTiles backup={backup} />
      <div className="grid grid-cols-12 items-start gap-[16px]">
        <section className="col-span-7 grid min-w-0 gap-[16px] max-[1180px]:col-span-12">
          {users && roles && branches ? (
            <UsersPanel users={users} roles={roles} branches={branches} meId={me.user.id} />
          ) : (
            <p className="m-0 text-muted">{t("users.noAccess")}</p>
          )}
          {devices && branches && (
            <DevicesPanel devices={devices} branches={branches} current={current} />
          )}
          {events && <AuditPanel events={events} />}
        </section>
        <section className="col-span-5 grid min-w-0 gap-[16px] max-[1180px]:col-span-12">
          <ReceiptPanel
            locale={me.branch.receipt_locale === "en" ? "en" : "ar"}
            branch={ar ? me.branch.name_ar : me.branch.name_en}
          />
          {license && <LicensePanel license={license} />}
        </section>
      </div>
    </>
  );
}
