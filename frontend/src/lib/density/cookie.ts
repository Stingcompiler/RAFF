export const DENSITY_COOKIE = "raff-density";
export const densities = ["compact", "default", "comfortable"] as const;
export type Density = (typeof densities)[number];
