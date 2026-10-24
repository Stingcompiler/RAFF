import { cn } from "@/lib/cn";

type Step = { label: string; state: "done" | "current" | "todo" };

/** Customer-facing order progress. */
export function OrderStatusStepper({ steps }: { steps: readonly Step[] }) {
  return (
    <ol className="m-0 grid list-none gap-[12px] p-0">
      {steps.map((s) => (
        <li key={s.label} className="flex items-center gap-[10px] text-[14px]">
          <span
            aria-hidden="true"
            className={cn(
              "grid size-[20px] flex-none place-items-center rounded-full text-[12px] font-bold",
              s.state === "done" && "bg-brand text-on-brand",
              s.state === "current" && "box-border border-2 border-brand bg-brand-subtle",
              s.state === "todo" && "box-border border-2 border-border-strong bg-surface",
            )}
          >
            {s.state === "done" ? "✓" : ""}
          </span>
          <span className={s.state === "todo" ? "text-text-muted" : "font-semibold"}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
