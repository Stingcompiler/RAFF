// Positive fixture: logical properties and token colors pass both rules.
export function Good() {
  return (
    <div className="ms-2 pe-4 text-start border-s bg-surface text-ink rounded-s-lg">
      <span style={{ marginInlineStart: 4, textAlign: "start" }} />
    </div>
  );
}
