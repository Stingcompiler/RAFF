import { cn } from "@/lib/cn";

const CHECK = "✓";

type Option = { id: string; title: string; detail: string; disabled?: boolean };

export function PickupSelector({ options, value }: { options: readonly Option[]; value: string }) {
  return (
    <div role="radiogroup" className="contents">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <div
            key={o.id}
            role="radio"
            aria-checked={on}
            aria-disabled={o.disabled || undefined}
            className={cn(
              "flex items-center gap-[12px] rounded-card p-[14px]",
              on ? "border-2 border-brand" : "border border-dashed border-border-strong",
              o.disabled && "opacity-55",
            )}
          >
            <b className="flex-1">
              {o.title}
              <div className={cn("text-body font-normal", on && "text-text-muted")}>{o.detail}</div>
            </b>
            {on && <span className="font-bold text-brand">{CHECK}</span>}
          </div>
        );
      })}
    </div>
  );
}
