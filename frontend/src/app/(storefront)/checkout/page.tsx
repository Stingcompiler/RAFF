import { Suspense } from "react";

import { CheckoutScreen } from "@/features/store/CheckoutScreen";

export default function CheckoutPage() {
  return (
    <Suspense>
      <CheckoutScreen />
    </Suspense>
  );
}
