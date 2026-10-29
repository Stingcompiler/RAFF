// Negative fixture: review C-04 — every line below must be reported.
export function BadAttrs({ dir }: { dir: string }) {
  return (
    <div>
      <input placeholder="Your full name" />
      <button aria-label="Enter your name" />
      <img alt="صورة المنتج" />
      <span className={`${dir}-0 block`} />
      <span className="shadow-[0_1px_2px_rgb(0_0_0/.12)]" />
      <span className="[box-shadow:0_0_2px_#fff]" />
    </div>
  );
}
