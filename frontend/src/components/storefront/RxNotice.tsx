export function RxNotice({ children }: { children: string }) {
  return (
    <div className="rounded-control bg-info-bg px-[10px] py-[8px] text-label font-medium text-info-text">
      {children}
    </div>
  );
}
