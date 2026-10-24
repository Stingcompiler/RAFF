/** Staff-facing order history: time, state, actor. */
export function OrderTimeline({ entries }: { entries: readonly { time: string; text: string }[] }) {
  return (
    <div className="grid gap-[4px] text-label">
      {entries.map((e, i) => (
        <div key={i}>
          <span dir="ltr" className="text-text-muted num">
            {e.time}
          </span>{" "}
          {e.text}
        </div>
      ))}
    </div>
  );
}
