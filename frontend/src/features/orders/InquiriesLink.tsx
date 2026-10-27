import Link from "next/link";
import { useTranslations } from "next-intl";

import { buttonClasses } from "@/components/ui/Button";

/** From the orders screens to the visitors' questions. */
export function InquiriesLink() {
  const t = useTranslations("orders.inq");
  return (
    <Link href="/orders/inquiries" className={buttonClasses({ variant: "outline" })}>
      {t("link")}
    </Link>
  );
}
