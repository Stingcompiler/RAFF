"use client";

import { ServerError } from "@/components/ServerError";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ServerError reset={reset} />;
}
