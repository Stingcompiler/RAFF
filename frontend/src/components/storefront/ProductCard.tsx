import type { ReactNode } from "react";

import { AvailabilityBadge, type Availability } from "./AvailabilityBadge";
import { PriceWithDate } from "./PriceWithDate";
import { RxNotice } from "./RxNotice";

type Props = {
  name: string;
  noImageLabel: string;
  price: string;
  updatedLabel?: string;
  updatedOn?: string;
  availability: Availability;
  availabilityLabel: string;
  /** Rx items: notice instead of price date, review request instead of add-to-cart. */
  rxNotice?: string;
  action: ReactNode;
  imageHeight?: number;
};

export function ProductCard(props: Props) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <div
        style={{ height: props.imageHeight ?? 72 }}
        className="grid place-items-center bg-placeholder-bg text-[12px] text-placeholder-ink"
      >
        {props.noImageLabel}
      </div>
      <div className="grid gap-[6px] p-[12px]">
        <b>{props.name}</b>
        {props.rxNotice && <RxNotice>{props.rxNotice}</RxNotice>}
        <PriceWithDate
          price={props.price}
          updatedLabel={props.updatedLabel}
          updatedOn={props.updatedOn}
        />
        <div>
          <AvailabilityBadge value={props.availability} label={props.availabilityLabel} />
        </div>
        {props.action}
      </div>
    </div>
  );
}

/** Storefront button looks: solid brand, outlined brand, and muted details. */
export const storeButton = {
  solid:
    "min-h-[44px] cursor-pointer rounded-[10px] border-0 bg-brand px-[16px] font-semibold whitespace-nowrap text-brand-ink",
  outline:
    "min-h-[44px] cursor-pointer rounded-[10px] border border-brand bg-transparent px-[16px] font-semibold whitespace-nowrap text-brand",
  muted:
    "min-h-[44px] rounded-[10px] border border-line-strong bg-transparent font-semibold text-muted",
};
