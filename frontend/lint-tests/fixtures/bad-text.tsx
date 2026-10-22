// Negative fixture: visible text must come from messages/*.json (react/jsx-no-literals).
export function BadText() {
  return (
    <div>
      <h1>Hello</h1>
      <p>{"مرحبا"}</p>
    </div>
  );
}
