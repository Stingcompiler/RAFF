/** Staff-facing order history: time, state, actor. */
export function OrderTimeline({ entries }: { entries: readonly { time: string; text: string }[] }) {
  return (
    <div className="grid gap-[4px] text-[13px]">
      {entries.map((e, i) => (
        <div key={i}>
          <span dir="ltr" className="text-text-muted">
            {e.time}
          </span>{" "}
          {e.text}
        </div>
      ))}
    </div>
  );
}
