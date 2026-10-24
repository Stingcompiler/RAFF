import { cn } from "@/lib/cn";

/** Every public price carries the date it was last updated. */
export function PriceWithDate({
  price,
  updatedLabel,
  updatedOn,
  size = "md",
}: {
  price: string;
  /** e.g. "Updated" — the date follows in its own LTR isolate. */
  updatedLabel?: string;
  updatedOn?: string;
  size?: "md" | "lg";
}) {
  return (
    <div
      className={cn("flex flex-wrap items-baseline", size === "lg" ? "gap-[10px]" : "gap-[8px]")}
    >
      <span className={cn("font-semibold", size === "lg" ? "text-land-feature" : "text-land-lead")}>
        {price}
      </span>
      <span className="text-caption text-text-muted">
        {updatedLabel && updatedOn ? (
          <>
            {updatedLabel}{" "}
            <span dir="ltr" className="num">
              {updatedOn}
            </span>
          </>
        ) : null}
      </span>
    </div>
  );
}
