// Negative fixture: every line below must be reported by raff/no-raw-color.
export function BadColor() {
  return (
    <div>
      <span className="bg-red-500" />
      <span className="text-[#ff0000]" />
      <span style={{ color: "#245C4F" }} />
      <span style={{ background: "rgb(0, 0, 0)" }} />
      <svg fill="white" />
    </div>
  );
}
