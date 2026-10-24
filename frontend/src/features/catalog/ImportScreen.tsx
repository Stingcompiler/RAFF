"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Panel } from "@/components/ui/Panel";
import { StatTile } from "@/components/ui/StatTile";
import { CodeCell, TableHead, TableRow, TextCell, type Column } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { apiDownload, apiSend, apiUpload } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { cn } from "@/lib/cn";

type Batch = Schemas["ImportBatch"];
type Row = {
  line: number;
  action: Action;
  errors: string[];
  data: { code: string; name_ar: string; name_en: string };
};
type Action = "create" | "update" | "duplicate" | "error";

const TONE: Record<Action, Tone> = {
  create: "success",
  update: "info",
  duplicate: "warn",
  error: "danger",
};
const KNOWN = new Set([
  "missing_code",
  "missing_name_ar",
  "missing_name_en",
  "missing_base_unit_ar",
  "missing_base_unit_en",
  "invalid_sale_unit_factor",
  "invalid_price",
  "invalid_reorder_level",
  "invalid_classification",
  "duplicate_code_in_file",
  "duplicate_barcode_in_file",
  "barcode_belongs_to_other_item",
  "same_name_strength_form",
  "missing_columns",
  "not_utf8",
  "file_too_large",
]);
const SHOWN = 300;

/** CSV import: preview with matching, then approve once. */
export function ImportScreen({ ar }: { ar: boolean }) {
  const t = useTranslations("import");
  const nav = useTranslations("inventory");
  const toast = useToast();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const note = (code: string) => (KNOWN.has(code) ? t(`e.${code}` as "e.failed") : code);

  async function preview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("preview");
    setError(null);
    const res = await apiUpload<Batch>("/catalog/imports/", new FormData(e.currentTarget));
    setBusy(null);
    if (!res.ok) {
      const code = typeof res.error?.detail === "string" ? res.error.detail : "";
      setError(`✕ ${KNOWN.has(code) ? note(code) : t("e.failed")}`);
      return;
    }
    setBatch(res.data);
  }

  async function apply() {
    if (!batch) return;
    setBusy("apply");
    const res = await apiSend<Batch>("POST", `/catalog/imports/${batch.id}/apply/`);
    setBusy(null);
    setConfirm(false);
    if (!res.ok) {
      toast.push("danger", t("e.failed"));
      return;
    }
    setBatch(res.data);
    const s = res.data.summary as Record<string, number>;
    toast.push("success", t("applied", { created: s.created ?? 0, updated: s.updated ?? 0 }));
  }

  const rows = (batch?.rows ?? []) as Row[];
  const summary = (batch?.summary ?? {}) as Record<string, number>;
  const columns: Column[] = [
    { header: t("colLine"), width: "60px" },
    { header: t("colCode"), width: "120px" },
    { header: t("colName"), width: "minmax(0,1fr)" },
    { header: t("colAction"), width: "150px" },
    { header: t("colNotes"), width: "minmax(0,1.2fr)" },
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        actions={
          <Link
            href="/inventory"
            className={cn(buttonClasses({ variant: "outline" }), "no-underline")}
          >
            {t("back")}
          </Link>
        }
      />
      <Panel title={t("pick")}>
        <form onSubmit={preview} className="grid grid-cols-[minmax(0,1fr)] gap-[12px] p-[16px]">
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="max-w-full text-body"
          />
          <div
            dir="ltr"
            className="text-start text-caption text-text-muted [overflow-wrap:anywhere] num"
          >
            {t("help")}
          </div>
          <div className="flex flex-wrap gap-[8px]">
            <Button type="submit" disabled={busy !== null}>
              {busy === "preview" ? t("previewing") : t("preview")}
            </Button>
            <Button
              variant="quiet"
              className="h-auto min-h-[40px] max-w-full py-[6px] whitespace-normal"
              onClick={() => void apiDownload("/catalog/export/", "items.csv")}
            >
              {t("download")}
            </Button>
          </div>
          {error && (
            <div role="alert" className="text-label font-medium text-danger-text">
              {error}
            </div>
          )}
        </form>
      </Panel>
      {batch && (
        <>
          <div className="grid grid-cols-4 gap-[16px] max-[900px]:grid-cols-2 max-[480px]:grid-cols-1">
            {(["create", "update", "duplicate", "error"] as const).map((a) => (
              <StatTile key={a} label={t(a)} value={(summary[a] ?? 0).toLocaleString("en-US")} />
            ))}
          </div>
          <Panel
            title={batch.file_name}
            note={
              batch.status === "applied" ? (
                <Badge tone="success">
                  {t("applied", { created: summary.created ?? 0, updated: summary.updated ?? 0 })}
                </Badge>
              ) : (
                <Button
                  disabled={(summary.create ?? 0) + (summary.update ?? 0) === 0 || busy !== null}
                  onClick={() => setConfirm(true)}
                >
                  {t("apply")}
                </Button>
              )
            }
          >
            <div role="table" aria-label={batch.file_name}>
              <TableHead columns={columns} />
              {rows.slice(0, SHOWN).map((r) => (
                <TableRow key={r.line} columns={columns}>
                  <CodeCell>{r.line}</CodeCell>
                  <CodeCell>{r.data.code}</CodeCell>
                  <TextCell>{ar ? r.data.name_ar : r.data.name_en}</TextCell>
                  <span role="cell" className="justify-self-start">
                    <Badge tone={TONE[r.action]} dense>
                      {t(r.action)}
                    </Badge>
                  </span>
                  <TextCell>{r.errors.map(note).join(" · ")}</TextCell>
                </TableRow>
              ))}
            </div>
          </Panel>
        </>
      )}
      <ConfirmDialog
        open={confirm}
        title={t("applyTitle")}
        body={t("applyBody")}
        impact={[
          { label: t("create"), value: String(summary.create ?? 0) },
          { label: t("update"), value: String(summary.update ?? 0) },
        ]}
        cancelLabel={t("back")}
        confirmLabel={t("apply")}
        busyLabel={nav("saving")}
        busy={busy === "apply"}
        onCancel={() => setConfirm(false)}
        onConfirm={apply}
      />
    </>
  );
}
