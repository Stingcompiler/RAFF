import { cn } from "@/lib/cn";

export type ReceiptLine = { name: string; total: string };

export type ReceiptData = {
  locale: "ar" | "en";
  shop: string;
  branch: string;
  number: string;
  /** "YYYY-MM-DD HH:MM" */
  issuedAt: string;
  lines: readonly ReceiptLine[];
  totalLabel: string;
  total: string;
  payments: readonly { label: string; amount: string }[];
  footer: string;
};

/** 80mm thermal receipt. Always light, always the branch's receipt locale. */
export function ReceiptPreview({ data, className }: { data: ReceiptData; className?: string }) {
  const ar = data.locale === "ar";
  const rule = <div className="my-[8px] [border-top:1px_dashed_var(--color-receipt-ink)]" />;
  return (
    <div
      data-theme="light"
      dir={ar ? "rtl" : "ltr"}
      lang={data.locale}
      className={cn(
        "w-[302px] bg-receipt-paper px-[16px] pt-[20px] pb-[28px] text-label leading-body text-receipt-ink shadow-receipt",
        "font-ui",
        className,
      )}
    >
      <div className="text-center text-lead font-bold">{data.shop}</div>
      <div className="text-center text-caption">{data.branch}</div>
      {rule}
      <div className="flex justify-between text-caption">
        <span>{data.number}</span>
        <span className="num" dir="ltr">
          {data.issuedAt}
        </span>
      </div>
      {rule}
      {data.lines.map((l, i) => (
        <div key={i} className="flex justify-between gap-[8px]">
          <span>{l.name}</span>
          <span dir="ltr" className="num">
            {l.total}
          </span>
        </div>
      ))}
      {rule}
      <div className="flex justify-between text-lead font-bold">
        <span>{data.totalLabel}</span>
        <span className="num" dir="ltr">
          {data.total}
        </span>
      </div>
      {data.payments.map((p) => (
        <div key={p.label} className="flex justify-between text-caption">
          <span>{p.label}</span>
          <span className="num" dir="ltr">
            {p.amount}
          </span>
        </div>
      ))}
      {rule}
      <div className="text-center text-caption">{data.footer}</div>
    </div>
  );
}
