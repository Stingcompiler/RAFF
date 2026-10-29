import { cn } from "@/lib/cn";

const HEIGHT = 140;
const SEP = "·";
const GRID_STEPS = [1, 0.5, 0] as const;

export type Bar = {
  /** Stable identity (a date); labels such as day initials can repeat. */
  id: string;
  /** Category on the axis: a day, a month. */
  label: string;
  /** Position of the bar only; the figure shown to the user is `text`, formatted by the server's value. */
  value: number;
  /** The exact figure for the tooltip and the screen reader. */
  text: string;
};

type Props = {
  bars: readonly Bar[];
  /** Axis tick for a fraction of the maximum (0, .5, 1), already in the axis unit. */
  tick: (fraction: number) => string;
  ariaLabel: string;
  /** The series' colour, chart-1 first (v2.2 §16.4). */
  className?: string;
};

/**
 * A single-series bar chart in plain markup: light grid in `border`, the value axis with its
 * unit, numbers as `.num`, and a tooltip that repeats the bar's values on hover and focus.
 * The last bar is the one to read; the rest are quieter, and every bar says its value in text.
 */
export function BarChart({ bars, tick, ariaLabel, className }: Props) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex gap-[8px] px-[16px] pt-[16px] pb-[8px]", className)}
    >
      <div
        aria-hidden="true"
        dir="ltr"
        className="flex flex-none flex-col justify-between pb-[22px] text-end text-caption leading-none text-text-muted num"
        style={{ height: HEIGHT + 22 }}
      >
        {GRID_STEPS.map((f) => (
          <span key={f}>{tick(f)}</span>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 flex flex-col justify-between"
          style={{ height: HEIGHT }}
        >
          {GRID_STEPS.map((f) => (
            <span key={f} className="block border-t border-border" />
          ))}
        </div>
        <ul
          className="relative m-0 flex list-none items-end gap-[12px] p-0"
          style={{ height: HEIGHT + 22 }}
        >
          {bars.map((b, i) => (
            <li
              key={b.id}
              className="group relative flex h-full flex-1 flex-col items-center justify-end gap-[6px]"
            >
              <span
                role="img"
                tabIndex={0}
                aria-label={`${b.label}: ${b.text}`}
                className={cn(
                  "block w-full rounded-t-[4px] bg-chart-1 outline-none focus-visible:shadow-[0_0_0_2px_var(--color-surface),0_0_0_4px_var(--color-focus)]",
                  i === bars.length - 1
                    ? "opacity-100"
                    : "opacity-55 hover:opacity-100 focus-visible:opacity-100",
                )}
                style={{ height: `${Math.max(2, Math.round((b.value / max) * HEIGHT))}px` }}
              />
              <span
                aria-hidden="true"
                dir="auto"
                className="pointer-events-none absolute start-1/2 z-10 hidden -translate-x-1/2 rounded-control border border-border bg-surface-raised px-[8px] py-[4px] text-caption whitespace-nowrap shadow-2 group-focus-within:block group-hover:block rtl:translate-x-1/2"
                style={{ bottom: Math.round((b.value / max) * HEIGHT) + 30 }}
              >
                {b.label} {SEP}{" "}
                <bdi dir="ltr" className="font-medium num">
                  {b.text}
                </bdi>
              </span>
              <span className="h-[16px] text-caption leading-snug text-text-muted">{b.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
