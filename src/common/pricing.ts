/**
 * Effective price rules. A sale price applies only inside its window:
 * it has started (or has no start) and has not ended (or has no end).
 */

export interface PriceFields {
  listPricePaise: number;
  salePricePaise: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
}

export function isSaleActive(p: PriceFields, now: Date = new Date()): boolean {
  if (p.salePricePaise === null || p.salePricePaise === undefined) return false;
  if (p.saleStartsAt && p.saleStartsAt.getTime() > now.getTime()) return false;
  if (p.saleEndsAt && p.saleEndsAt.getTime() <= now.getTime()) return false;
  return p.salePricePaise < p.listPricePaise;
}

/** The price the customer pays right now, in paise. */
export function effectivePricePaise(p: PriceFields, now: Date = new Date()): number {
  return isSaleActive(p, now) ? (p.salePricePaise as number) : p.listPricePaise;
}

/** The struck-through "was" price, in paise, when a sale is active. */
export function compareAtPaise(p: PriceFields, now: Date = new Date()): number | null {
  return isSaleActive(p, now) ? p.listPricePaise : null;
}
