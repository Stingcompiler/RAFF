import { cookies } from "next/headers";

import { DENSITY_COOKIE, type Density, densities } from "./cookie";

export { DENSITY_COOKIE, densities, type Density };

/** The density this device chose; null while it has not (phones then default to comfortable). */
export async function getDensity(): Promise<Density | null> {
  const value = (await cookies()).get(DENSITY_COOKIE)?.value;
  return (densities as readonly string[]).includes(value ?? "") ? (value as Density) : null;
}
