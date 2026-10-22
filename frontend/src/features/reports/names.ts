export const REPORTS = [
  "gross_profit",
  "stock_value",
  "expiry",
  "shortages",
  "slow_moving",
  "receivables",
  "shifts",
] as const;
export type ReportName = (typeof REPORTS)[number];
