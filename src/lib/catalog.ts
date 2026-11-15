import type { Product, RecordItem } from "../../shared/model";
export function catalogPage(
  products: RecordItem<Product>[],
  query: string,
  page: number,
  pageSize = 8,
) {
  return paginate(searchProducts(products, query), page, pageSize);
}
export function searchProducts(products: RecordItem<Product>[], query: string) {
  const q = query.toLowerCase().trim();
  return products.filter((p) =>
    [p.data.name, p.data.variant, p.data.category]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}
export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.max(1, Math.min(Math.floor(page) || 1, total));
  return {
    count: items.length,
    total,
    current,
    items: items.slice((current - 1) * pageSize, current * pageSize),
  };
}
