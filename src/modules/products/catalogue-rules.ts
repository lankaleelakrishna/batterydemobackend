/**
 * Catalogue vocabulary and filter rules. These values mirror the frontend's
 * `src/lib/catalogue.ts` and `src/types/product.ts`. Changing one side without
 * the other breaks the storefront filters, so change both together.
 */

export const KIND_VALUES = ['battery', 'inverter', 'combo'] as const;
export type KindValue = (typeof KIND_VALUES)[number];

export const KIND_LABEL: Record<KindValue, string> = {
  battery: 'Battery',
  inverter: 'Inverter',
  combo: 'Inverter + battery combo',
};

export const TECHNOLOGY_VALUES = ['tall-tubular', 'short-tubular', 'flat-plate', 'lithium-ion', 'smf'] as const;
export type TechnologyValue = (typeof TECHNOLOGY_VALUES)[number];

export const TECHNOLOGY_LABEL: Record<TechnologyValue, string> = {
  'tall-tubular': 'Tall tubular',
  'short-tubular': 'Short tubular',
  'flat-plate': 'Flat plate',
  'lithium-ion': 'Lithium-ion',
  smf: 'Sealed maintenance-free',
};

/** Capacity buckets are [min, max) in Ah. A null max means "and above". */
export const CAPACITY_BUCKETS = [
  { id: 'lt-100', min: 0, max: 100 },
  { id: '100-149', min: 100, max: 150 },
  { id: '150-199', min: 150, max: 200 },
  { id: '200-plus', min: 200, max: null },
] as const;

/** Price buckets are [min, max) in paise. Matches the storefront's rupee ranges. */
export const PRICE_BUCKETS = [
  { id: 'lt-10k', min: 0, max: 1_000_000 },
  { id: '10k-20k', min: 1_000_000, max: 2_000_000 },
  { id: '20k-40k', min: 2_000_000, max: 4_000_000 },
  { id: '40k-plus', min: 4_000_000, max: null },
] as const;

export const WARRANTY_OPTIONS = [12, 24, 36, 60] as const;
export const SORT_VALUES = ['featured', 'price-asc', 'price-desc', 'capacity-desc', 'warranty-desc', 'rating-desc'] as const;
export type SortValue = (typeof SORT_VALUES)[number];

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 48;
/** Stock at or below this count shows as "low stock". */
export const LOW_STOCK_THRESHOLD = 5;
export const MAX_CART_QUANTITY = 10;
export const MAX_COMPARE_IDS = 4;

export type StockStatus = 'in-stock' | 'low-stock' | 'out-of-stock' | 'preorder';

export function stockStatus(quantity: number, acceptsPreorders: boolean): StockStatus {
  if (quantity <= 0) return acceptsPreorders ? 'preorder' : 'out-of-stock';
  return quantity <= LOW_STOCK_THRESHOLD ? 'low-stock' : 'in-stock';
}

/** Keeps only values from `allowed`, preserving order and dropping duplicates and unknown entries. */
export function pickAllowed<T extends string>(values: string[], allowed: readonly T[]): T[] {
  const set = new Set<string>(allowed);
  return [...new Set(values)].filter((v): v is T => set.has(v));
}

/** Splits a comma-separated query value. Empty parts are dropped. */
export function parseCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
