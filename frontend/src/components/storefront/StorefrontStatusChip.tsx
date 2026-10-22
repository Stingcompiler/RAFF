export function StorefrontStatusChip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-[8px] justify-self-start rounded-full bg-success-bg px-[12px] py-[4px] text-[12px] font-medium text-success">
      <span aria-hidden="true" className="size-[8px] rounded-full bg-current" />
      {children}
    </span>
  );
}
