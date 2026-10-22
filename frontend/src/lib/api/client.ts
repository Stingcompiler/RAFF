import type { paths } from "./schema";

export type HealthResponse =
  paths["/api/v1/health/"]["get"]["responses"]["200"]["content"]["application/json"];
