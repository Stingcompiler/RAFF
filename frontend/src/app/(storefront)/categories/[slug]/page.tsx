import { StoreGrid } from "@/features/store/StoreGrid";

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const p = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  return (
    <StoreGrid
      base={`/categories/${slug}`}
      filters={{
        q: one(p.q),
        category: slug,
        availability: one(p.availability),
        sort: one(p.sort),
      }}
    />
  );
}
