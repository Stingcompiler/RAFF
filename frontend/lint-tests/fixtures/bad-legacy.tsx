// Negative fixture: removed pre-v2.2 color tokens fail no-legacy-token.
export function BadLegacy() {
  return (
    <div>
      <p className="text-ink">class</p>
      <p className="bg-surface hover:border-line">variant</p>
      <p className="bg-primary/50">alpha</p>
      <p style={{ color: "var(--color-muted)" }}>variable</p>
      <p className="bg-warn-bg text-danger">two</p>
    </div>
  );
}
