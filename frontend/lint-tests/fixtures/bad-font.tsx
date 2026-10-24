// Negative fixture: type values written in a component fail no-raw-font.
export function BadFont() {
  return (
    <div>
      <p className="text-[14px]">size</p>
      <p className="leading-[1.7] font-[600]">line and weight</p>
      <p className="[font-family:Tajawal]">family</p>
      <p style={{ fontSize: 13, lineHeight: 1.5 }}>style</p>
    </div>
  );
}
