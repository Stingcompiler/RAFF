"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { ReceiptPreview } from "@/components/ui/ReceiptPreview";
import { StatTile } from "@/components/ui/StatTile";
import {
  CodeCell,
  TableEmpty,
  TableHead,
  TableRow,
  TextCell,
  type Column,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { apiSend } from "@/lib/api/browser";
import type { Branch, Device, DeviceInfo, Schemas } from "@/lib/api/types";
import { timeOfDay } from "@/lib/format";

const DASH = "—";

/** Last good backup and restore drill (recorded by infra/backup scripts); sync is WO-11. */
export function SystemTiles({ backup }: { backup: Schemas["BackupStatus"] | null }) {
  const t = useTranslations("settings");
  const ok = backup?.last_ok;
  const drill = backup?.last_restore_test;
  return (
    <div className="mb-[16px] grid grid-cols-3 gap-[16px] max-[600px]:grid-cols-1">
      <StatTile
        label={t("lastBackup")}
        value={ok ? [ok.at.slice(0, 10), timeOfDay(ok.at)].join(" ") : t("notYet")}
        note={
          backup?.failing && backup.last_failed
            ? t("backupFailed", { detail: backup.last_failed.detail || DASH })
            : ok
              ? ok.offsite
                ? t("offsite")
                : t("localOnly")
              : t("notConfigured")
        }
      />
      <StatTile label={t("pendingSync")} value="0" note={t("noErrors")} />
      <StatTile
        label={t("restoreTest")}
        value={drill ? drill.at.slice(0, 10) : t("notYet")}
        note={drill ? drill.detail : t("notConfigured")}
      />
    </div>
  );
}

export function DevicesPanel({
  devices,
  branches,
  current,
}: {
  devices: Device[];
  branches: Branch[];
  current: DeviceInfo | null;
}) {
  const t = useTranslations("settings");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const router = useRouter();
  const branchName = (id: string) => {
    const b = branches.find((x) => x.id === id);
    return b ? (ar ? b.name_ar : b.name_en) : DASH;
  };
  const register = async (d: Device) => {
    const res = await apiSend<Device>("POST", `/devices/${d.id}/register/`);
    if (res.ok) {
      toast.push("success", t("registeredDone", { name: ar ? d.name_ar : d.name_en }));
      router.refresh();
    }
  };
  const columns: Column[] = [
    { header: t("colDevice"), width: "1fr" },
    { header: t("colBranch"), width: "140px" },
    { header: t("colRegistered"), width: "130px" },
    { header: "", width: "150px" },
  ];
  return (
    <Panel title={t("devices")}>
      <div role="table" aria-label={t("devices")}>
        <TableHead columns={columns} />
        {devices.map((d) => {
          const here = current?.device?.id === d.id;
          return (
            <TableRow key={d.id} columns={columns}>
              <TextCell>{ar ? d.name_ar : d.name_en}</TextCell>
              <TextCell>{branchName(d.branch)}</TextCell>
              <span role="cell">
                <Badge tone={here ? "success" : d.registered_at ? "info" : "warn"} dense>
                  {here ? t("thisDevice") : d.registered_at ? t("registered") : t("unregistered")}
                </Badge>
              </span>
              <span role="cell">
                {!here && (
                  <Button
                    variant="quiet"
                    className="h-[32px] px-[8px]"
                    onClick={() => void register(d)}
                  >
                    {t("registerHere")}
                  </Button>
                )}
              </span>
            </TableRow>
          );
        })}
        {devices.length === 0 && <TableEmpty>{DASH}</TableEmpty>}
      </div>
    </Panel>
  );
}

export function LicensePanel({ license }: { license: Schemas["LicenseStatus"] }) {
  const t = useTranslations("settings");
  const tone =
    license.state === "valid" ? "success" : license.state === "missing" ? "warn" : "danger";
  return (
    <Panel title={t("license")}>
      <div className="grid gap-[8px] p-[16px]">
        <Badge tone={tone} className="justify-self-start">
          {t(`licenseState.${license.state}`)}
        </Badge>
        {license.organization && (
          <div className="flex justify-between gap-[12px]">
            <span className="text-text-muted">{t("licensee")}</span>
            <span>{license.organization}</span>
          </div>
        )}
        <p className="m-0 text-[13px] text-text-muted">{t("licenseNote")}</p>
      </div>
    </Panel>
  );
}

export function ReceiptPanel({ locale, branch }: { locale: "ar" | "en"; branch: string }) {
  const t = useTranslations("settings");
  const ar = locale === "ar";
  return (
    <Panel title={t("receipt")} note={t("receiptLocale", { locale: ar ? "العربية" : "English" })}>
      <div className="grid place-items-center overflow-x-auto bg-surface-subtle p-[16px]">
        <ReceiptPreview
          data={{
            locale,
            shop: ar ? "رَفّ — صيدلية تجريبية" : "Raff — Sample Pharmacy",
            branch,
            number: ar ? "فاتورة INV-000001" : "Invoice INV-000001",
            issuedAt: "2026-10-22 14:32",
            lines: [{ name: ar ? "أموكسيسيلين/كلافولانيك × 1" : "Augmentin × 1", total: "12,500" }],
            totalLabel: ar ? "الإجمالي" : "Total",
            total: ar ? "12,500 ج.س" : "SDG 12,500",
            payments: [{ label: ar ? "نقدي" : "Cash", amount: ar ? "12,500 ج.س" : "SDG 12,500" }],
            footer: ar ? "شكراً لزيارتكم" : "Thank you",
          }}
        />
      </div>
    </Panel>
  );
}

export function AuditPanel({ events }: { events: Schemas["AuditEvent"][] }) {
  const t = useTranslations("settings");
  const ar = useLocale() === "ar";
  const columns: Column[] = [
    { header: t("colWhen"), width: "140px" },
    { header: t("colWho"), width: "140px" },
    { header: t("colAction"), width: "140px" },
    { header: t("colObject"), width: "1fr" },
  ];
  return (
    <Panel title={t("audit")}>
      <div role="table" aria-label={t("audit")}>
        <TableHead columns={columns} />
        {events.map((e) => (
          <TableRow key={e.id} columns={columns}>
            <CodeCell>{[e.created_at.slice(0, 10), timeOfDay(e.created_at)].join(" ")}</CodeCell>
            <TextCell>{(ar ? e.actor_name_ar : e.actor_name_en) || DASH}</TextCell>
            <CodeCell>{e.action}</CodeCell>
            <CodeCell>
              {[e.object_type, String((e.data as Record<string, unknown>)?.number ?? "")]
                .filter(Boolean)
                .join(" ")}
            </CodeCell>
          </TableRow>
        ))}
        {events.length === 0 && <TableEmpty>{t("noAudit")}</TableEmpty>}
      </div>
    </Panel>
  );
}
