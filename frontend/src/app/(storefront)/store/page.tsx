import { StoreGrid } from "@/features/store/StoreGrid";

export default async function StorePage({ searchParams }: PageProps<"/store">) {
  const p = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return (
    <StoreGrid
      base="/store"
      filters={{
        q: one(p.q),
        category: one(p.category),
        availability: one(p.availability),
        sort: one(p.sort),
      }}
    />
  );
}
