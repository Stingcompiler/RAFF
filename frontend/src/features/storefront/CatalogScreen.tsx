"use client";

import { useLocale, useTranslations } from "next-intl";
import { type ChangeEvent, useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { TextInput, Textarea } from "@/components/ui/Field";
import { NoImageIcon, SearchIcon } from "@/components/ui/icons";
import { Panel } from "@/components/ui/Panel";
import { TableEmpty, TableHead, TableRow, TextCell, type Column } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { apiGet, apiSend, apiUpload } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

type Row = Schemas["ListingRow"];
const MISSING = ["image", "description", "price", "category"] as const;
const ERRORS = ["incomplete", "slug_taken", "image_type", "image_too_large"] as const;

/** Published catalog (§5.3): publishing is refused until a listing is complete. */
export function CatalogScreen({ initial }: { initial: Row[] }) {
  const t = useTranslations("storeAdmin");
  const ar = useLocale() === "ar";
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<Row | null>(null);
  const [draft, setDraft] = useState({ description_ar: "", description_en: "" });

  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      const res = await apiGet<Row[]>(`/storefront/listings/?q=${encodeURIComponent(q)}`);
      if (live && res.ok) setRows(res.data);
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  const replace = (row: Row) => {
    setRows((prev) => prev.map((r) => (r.item_id === row.item_id ? row : r)));
    if (chosen?.item_id === row.item_id) setChosen(row);
  };
  const fail = (error: Record<string, unknown> | null) => {
    const code = typeof error?.detail === "string" ? error.detail : "";
    toast.push(
      "danger",
      (ERRORS as readonly string[]).includes(code)
        ? t(`errors.${code as (typeof ERRORS)[number]}`)
        : t("errors.failed"),
    );
  };
  const patch = async (row: Row, body: Record<string, unknown>) => {
    const res = await apiSend<Row>("PATCH", `/storefront/listings/${row.item_id}/`, body);
    if (!res.ok) return fail(res.error);
    replace(res.data);
    toast.push("success", t("saved"));
  };
  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !chosen) return;
    const form = new FormData();
    form.append("image", file);
    const res = await apiUpload<Row>(`/storefront/listings/${chosen.item_id}/image/`, form);
    if (!res.ok) return fail(res.error);
    replace(res.data);
  };
  const missingText = (row: Row) =>
    row.missing.length === 0
      ? t("complete")
      : row.missing
          .map((m) =>
            (MISSING as readonly string[]).includes(m)
              ? t(`miss.${m as (typeof MISSING)[number]}`)
              : m,
          )
          .join("، ");

  const columns: Column[] = [
    { header: t("hItem"), width: "minmax(0,1fr)" },
    { header: t("cls"), width: "70px" },
    { header: t("missing"), width: "170px" },
    { header: t("published"), width: "80px" },
  ];
  return (
    <>
      <PageHeader title={t("catT")} />
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-[16px] max-[1180px]:grid-cols-1">
        <Panel
          title={t("catT")}
          chips={
            <label className="ms-auto flex items-center gap-[6px] rounded-full border border-border px-[12px] py-[2px] text-[13px] text-text-muted focus-within:border-brand">
              <SearchIcon size={14} />
              <input
                type="search"
                aria-label={t("search")}
                placeholder={t("search")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-[160px] border-0 bg-transparent p-0 text-[13px] text-text outline-none"
              />
            </label>
          }
        >
          <div role="table" aria-label={t("catT")}>
            <TableHead columns={columns} />
            {rows.map((row) => (
              <TableRow
                key={row.item_id}
                columns={columns}
                selected={chosen?.item_id === row.item_id}
                onActivate={() => {
                  setChosen(row);
                  setDraft({
                    description_ar: row.description_ar,
                    description_en: row.description_en,
                  });
                }}
              >
                <TextCell>
                  {[ar ? row.name_ar : row.name_en, row.strength].filter(Boolean).join(" ")}
                </TextCell>
                <TextCell>{t(`classes.${row.classification === "rx" ? "rx" : "otc"}`)}</TextCell>
                <span
                  role="cell"
                  className={cn(
                    "text-[13px]",
                    row.missing.length ? "text-warning-text" : "text-success-text",
                  )}
                >
                  {missingText(row)}
                </span>
                <span role="cell">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.published}
                    aria-label={[t("publish"), row.name_en].join(" — ")}
                    disabled={!row.published && row.missing.length > 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      void patch(row, { published: !row.published });
                    }}
                    className={cn(
                      "relative h-[24px] w-[42px] cursor-pointer rounded-full border-0 p-0 transition-[background] duration-(--motion-feedback) disabled:cursor-not-allowed disabled:opacity-50",
                      row.published ? "bg-brand" : "bg-border-strong",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-[3px] size-[18px] rounded-full bg-surface transition-[inset-inline-start] duration-(--motion-feedback)",
                        row.published ? "start-[21px]" : "start-[3px]",
                      )}
                    />
                  </button>
                </span>
              </TableRow>
            ))}
            {rows.length === 0 && <TableEmpty>{t("pick")}</TableEmpty>}
          </div>
        </Panel>
        <Panel title={t("preview")}>
          {chosen ? (
            <div className="grid gap-[12px] p-[16px]">
              <div className="overflow-hidden rounded-card border border-border">
                {chosen.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- uploaded listing image
                  <img src={chosen.image} alt="" className="block h-[120px] w-full object-cover" />
                ) : (
                  <div className="grid h-[80px] place-content-center justify-items-center gap-[4px] bg-surface-subtle text-[12px] text-text-muted">
                    <NoImageIcon size={22} />
                    {t("noImg")}
                  </div>
                )}
                <div className="grid gap-[6px] p-[12px]">
                  <b>
                    {[ar ? chosen.name_ar : chosen.name_en, chosen.strength]
                      .filter(Boolean)
                      .join(" ")}
                  </b>
                  {chosen.price && chosen.classification !== "rx" && (
                    <div dir="ltr" className="text-start text-[18px] font-semibold">
                      {money(chosen.price, ar ? "ar" : "en")}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-[13px] text-text-muted">{t("noStock")}</div>
              <label className="grid gap-[4px] type-label text-text-secondary">
                {t("image")}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => void upload(e)}
                  className="text-[13px]"
                />
              </label>
              <label className="grid gap-[4px] type-label text-text-secondary">
                {t("descAr")}
                <Textarea
                  rows={3}
                  value={draft.description_ar}
                  onChange={(e) => setDraft((d) => ({ ...d, description_ar: e.target.value }))}
                />
              </label>
              <label className="grid gap-[4px] type-label text-text-secondary">
                {t("descEn")}
                <Textarea
                  dir="ltr"
                  rows={3}
                  value={draft.description_en}
                  onChange={(e) => setDraft((d) => ({ ...d, description_en: e.target.value }))}
                />
              </label>
              <label className="grid gap-[4px] type-label text-text-secondary">
                {t("slug")}
                <TextInput
                  dir="ltr"
                  defaultValue={chosen.slug}
                  key={chosen.slug}
                  onBlur={(e) =>
                    e.target.value !== chosen.slug && void patch(chosen, { slug: e.target.value })
                  }
                />
              </label>
              <Button className="justify-self-start" onClick={() => void patch(chosen, draft)}>
                {t("save")}
              </Button>
            </div>
          ) : (
            <p className="m-0 p-[16px] text-text-muted">{t("pick")}</p>
          )}
        </Panel>
      </div>
    </>
  );
}
