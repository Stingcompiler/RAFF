"use client";

/** Open a prefilled WhatsApp chat, or copy the message for another channel. */
export function WhatsAppAction({
  href,
  message,
  openLabel,
  copyLabel,
}: {
  href: string;
  message: string;
  openLabel: string;
  copyLabel: string;
}) {
  return (
    <div className="flex gap-[8px]">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-[44px] flex-1 items-center justify-center rounded-[10px] border border-brand font-semibold whitespace-nowrap text-brand no-underline"
      >
        {openLabel}
      </a>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(message)}
        className="min-h-[44px] cursor-pointer rounded-[10px] border border-border-strong bg-transparent px-[16px] whitespace-nowrap text-text"
      >
        {copyLabel}
      </button>
    </div>
  );
}
