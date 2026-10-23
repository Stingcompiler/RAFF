"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import {
  BadgeCell,
  CodeCell,
  NumberCell,
  TableEmpty,
  TableHead,
  TableRow,
  TextCell,
  type Column,
} from "@/components/ui/Table";
import { apiSend } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { amount, timeOfDay } from "@/lib/format";
import { usePhone } from "@/lib/phone";

import { scopeLabel, type Take, type TakeDetail } from "./labels";
import { PhoneCount } from "./PhoneCount";

type Props = { takes: Take[]; categories: Schemas["Category"][]; canCount: boolean };

/** Counts on a computer; the camera count on a phone (Raff Mobile). */
export function StocktakeList(props: Props) {
  const phone = usePhone();
  return phone ? (
    <PhoneCount takes={props.takes} canCount={props.canCount} />
  ) : (
    <StocktakeDesktop {...props} />
  );
}

function StocktakeDesktop({ takes, categories, canCount }: Props) {
  const t = useTranslations("stocktake");
  const tCommon = useTranslations("common");
  const ar = useLocale() === "ar";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await apiSend<TakeDetail>("POST", "/stocktakes/", {
      category_id: category || null,
    });
    setBusy(false);
    if (res.ok) router.push(`/stocktake/${res.data.id}`);
  };

  const columns: Column[] = [
    { header: t("colNumber"), width: "110px" },
    { header: t("colScope"), width: "minmax(0,1fr)" },
    { header: t("colSnapshot"), width: "150px" },
    { header: t("colCounted"), width: "90px", numeric: true },
    { header: t("colImpact"), width: "120px", numeric: true },
    { header: t("colStatus"), width: "110px" },
  ];
  return (
    <>
      <PageHeader
        title={t("title")}
        actions={canCount && <Button onClick={() => setOpen(true)}>{t("newTake")}</Button>}
      />
      <Panel title={t("list")}>
        <div role="table" aria-label={t("list")}>
          <TableHead columns={columns} />
          {takes.map((take) => (
            <TableRow
              key={take.id}
              columns={columns}
              onActivate={() => router.push(`/stocktake/${take.id}`)}
            >
              <CodeCell>{take.number}</CodeCell>
              <TextCell>{scopeLabel(take, ar, t)}</TextCell>
              <CodeCell>
                {[take.snapshot_at.slice(0, 10), timeOfDay(take.snapshot_at)].join(" ")}
              </CodeCell>
              <NumberCell>{[take.counted, take.total].join(" / ")}</NumberCell>
              <NumberCell>{amount(take.impact)}</NumberCell>
              <BadgeCell tone={take.status === "approved" ? "success" : "info"}>
                {t(`status.${take.status === "approved" ? "approved" : "draft"}`)}
              </BadgeCell>
            </TableRow>
          ))}
          {takes.length === 0 && <TableEmpty>{t("none")}</TableEmpty>}
        </div>
      </Panel>
      <Dialog
        open={open}
        onClose={busy ? undefined : () => setOpen(false)}
        labelledBy="start-title"
      >
        <form onSubmit={start} className="grid gap-[14px]">
          <div id="start-title" className="text-[16px] font-medium">
            {t("startTitle")}
          </div>
          <div className="text-muted">{t("startBody")}</div>
          <label className="grid gap-[4px] text-[12px] font-medium text-muted">
            {t("category")}
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t("scopeAll")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {ar ? c.name_ar : c.name_en}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex justify-end gap-[8px]">
            <Button variant="outline" size="lg" onClick={() => setOpen(false)} disabled={busy}>
              {tCommon("back")}
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {t("start")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
