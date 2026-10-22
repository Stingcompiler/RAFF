"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import {
  CodeCell,
  NumberCell,
  TableEmpty,
  TableHead,
  TableRow,
  TextCell,
  type Column,
} from "@/components/ui/Table";
import { apiDownload, apiGet } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { amount } from "@/lib/format";

import { REPORTS, type ReportName } from "./names";

type Report = Schemas["Report"];
const PERIOD: ReportName[] = ["gross_profit", "shifts"];
const DAYS: ReportName[] = ["expiry", "slow_moving"];
const TOTAL_KEYS = [
  "revenue",
  "cost",
  "profit",
  "margin",
  "value",
  "count",
  "receivable",
  "payable",
  "sales",
  "variance",
] as const;
const WIDTH: Record<string, string> = {
  text: "minmax(0,1fr)",
  code: "100px",
  date: "100px",
  number: "90px",
  money: "120px",
  percent: "80px",
};
const PERCENT = "%";

type Props = { initial: Report; name: ReportName; branch: string };

/** Reports (Raff Screens › التقارير): seven tables, filters, CSV export. No decorative charts. */
export function ReportsScreen({ initial, name: initialName, branch }: Props) {
  const t = useTranslations("reports");
  const ar = useLocale() === "ar";
  const [name, setName] = useState<ReportName>(initialName);
  const [report, setReport] = useState(initial);
  const [from, setFrom] = useState(initial.start);
  const [to, setTo] = useState(initial.end);
  const [days, setDays] = useState(String(initial.days));

  const query = (n: ReportName, f = from, tt = to, d = days) => {
    const params = new URLSearchParams();
    if (PERIOD.includes(n)) {
      params.set("from", f);
      params.set("to", tt);
    }
    if (DAYS.includes(n)) params.set("days", d);
    return params;
  };
  const load = async (n: ReportName, params: URLSearchParams) => {
    const res = await apiGet<Report>(`/reports/${n}/?${params}`);
    if (res.ok) {
      setReport(res.data);
      setFrom(res.data.start);
      setTo(res.data.end);
      setDays(String(res.data.days));
    }
  };
  const pick = (n: ReportName) => {
    setName(n);
    void load(n, new URLSearchParams());
  };
  const apply = (e: FormEvent) => {
    e.preventDefault();
    void load(name, query(name));
  };
  const exportCsv = () => {
    const params = query(name);
    params.set("export", "csv");
    params.set("lang", ar ? "ar" : "en");
    void apiDownload(`/reports/${name}/?${params}`, `${name}.csv`);
  };

  const columns: Column[] = report.columns.map((c) => ({
    header: ar ? c.label_ar : c.label_en,
    width: WIDTH[c.kind] ?? "1fr",
    numeric: ["number", "money", "percent"].includes(c.kind),
  }));
  const cell = (row: Record<string, unknown>, key: string, kind: string) => {
    const raw = !ar && row[`${key}_en`] !== undefined ? row[`${key}_en`] : row[key];
    if (raw === null || raw === undefined || raw === "") return "";
    if (key === "kind") return t(`kind.${raw === "supplier" ? "supplier" : "customer"}`);
    if (kind === "money") return amount(String(raw));
    if (kind === "percent") return [amount(String(raw)), PERCENT].join("");
    if (kind === "number") return amount(String(raw));
    return String(raw);
  };
  const note = PERIOD.includes(name)
    ? t("period", { from: report.start, to: report.end, branch })
    : DAYS.includes(name)
      ? t("days", { days: report.days, branch })
      : t("branchOnly", { branch });
  const totals = TOTAL_KEYS.filter(
    (k) => report.totals[k] !== undefined && report.totals[k] !== null,
  );

  return (
    <>
      <PageHeader title={t("title")} actions={<Button onClick={exportCsv}>{t("export")}</Button>} />
      <div className="grid grid-cols-12 items-start gap-[16px]">
        <section className="col-span-4 min-w-0 max-[1180px]:col-span-12">
          <Panel title={t("available")}>
            <ul className="m-0 list-none p-0" role="list">
              {REPORTS.map((n) => (
                <li key={n} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    aria-current={n === name ? "true" : undefined}
                    onClick={() => pick(n)}
                    className={cn(
                      "type-inherit flex min-h-[44px] w-full cursor-pointer items-center border-0 px-[16px] text-start text-ink hover:bg-sidebar",
                      n === name ? "bg-accent font-medium" : "bg-transparent",
                    )}
                  >
                    {t(`names.${n}`)}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
        <section className="col-span-8 min-w-0 max-[1180px]:col-span-12">
          <Panel title={t(`names.${name}`)} note={note}>
            {(PERIOD.includes(name) || DAYS.includes(name)) && (
              <form
                onSubmit={apply}
                className="flex flex-wrap items-end gap-[8px] border-b border-line p-[12px]"
              >
                {PERIOD.includes(name) ? (
                  <>
                    <label className="grid gap-[4px] text-[12px] font-medium text-muted">
                      {t("from")}
                      <TextInput
                        dir="ltr"
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label className="grid gap-[4px] text-[12px] font-medium text-muted">
                      {t("to")}
                      <TextInput
                        dir="ltr"
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                  </>
                ) : (
                  <label className="grid gap-[4px] text-[12px] font-medium text-muted">
                    {t("daysLabel")}
                    <TextInput
                      dir="ltr"
                      type="number"
                      min={1}
                      value={days}
                      onChange={(e) => setDays(e.target.value)}
                    />
                  </label>
                )}
                <Button type="submit" variant="outline">
                  {t("apply")}
                </Button>
              </form>
            )}
            <div role="table" aria-label={t(`names.${name}`)}>
              <TableHead columns={columns} />
              {report.rows.map((row, i) => (
                <TableRow key={i} columns={columns}>
                  {report.columns.map((c) =>
                    c.kind === "code" || c.kind === "date" ? (
                      <CodeCell key={c.key}>{cell(row, c.key, c.kind)}</CodeCell>
                    ) : columns[report.columns.indexOf(c)]?.numeric ? (
                      <NumberCell key={c.key}>{cell(row, c.key, c.kind)}</NumberCell>
                    ) : (
                      <TextCell key={c.key}>{cell(row, c.key, c.kind)}</TextCell>
                    ),
                  )}
                </TableRow>
              ))}
              {report.rows.length === 0 && <TableEmpty>{t("noRows")}</TableEmpty>}
            </div>
            {totals.length > 0 && report.rows.length > 0 && (
              <dl className="m-0 flex flex-wrap justify-end gap-x-[24px] gap-y-[6px] border-t border-line px-[16px] py-[12px]">
                {totals.map((k) => (
                  <div key={k} className="flex gap-[8px]">
                    <dt className="text-muted">{t(`totals.${k}`)}</dt>
                    <dd
                      dir="ltr"
                      className="m-0 font-semibold tabular-nums"
                      data-testid={`total-${k}`}
                    >
                      {k === "margin"
                        ? [amount(String(report.totals[k])), PERCENT].join("")
                        : amount(String(report.totals[k]))}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>
        </section>
      </div>
    </>
  );
}
