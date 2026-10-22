import { notFound } from "next/navigation";

/** Design-review routes (/dev/*) exist in development, or when RAFF_DEV_ROUTES=1. */
export function assertDevRoutes() {
  if (process.env.NODE_ENV !== "development" && process.env.RAFF_DEV_ROUTES !== "1") notFound();
}
