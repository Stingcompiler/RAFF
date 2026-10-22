// Negative fixture: every line below must be reported by raff/no-physical-properties.
export function BadPhysical() {
  return (
    <div>
      <span className="ml-2" />
      <span className="pr-4" />
      <span className="text-left" />
      <span className="border-r" />
      <span style={{ marginLeft: 4 }} />
      <span style={{ textAlign: "right" }} />
    </div>
  );
}
