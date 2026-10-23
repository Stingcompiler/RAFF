export function RxNotice({ children }: { children: string }) {
  return (
    <div className="rounded-[8px] bg-info-bg px-[10px] py-[8px] text-[13px] font-medium text-info-text">
      {children}
    </div>
  );
}
