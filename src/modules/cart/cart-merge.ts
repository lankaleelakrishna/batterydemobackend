/**
 * Merges a guest cart (kept in the browser) into the account cart.
 *
 * Rules:
 * - One line per product: identical product ids are combined, never duplicated.
 * - Quantities never exceed the cap, and never drop below 1.
 * - The result is the larger of the two quantities, not their sum. Merging the
 *   same guest cart twice therefore gives the same result (idempotent).
 * - Prices never come from the guest cart. Only product ids and quantities are used.
 */
export interface CartLineInput {
  productId: number;
  quantity: number;
}

export function clampQuantity(quantity: number, cap: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(cap, Math.max(1, Math.trunc(quantity)));
}

export function mergeCartQuantities(
  serverLines: CartLineInput[],
  guestLines: CartLineInput[],
  cap: number,
): Map<number, number> {
  const merged = new Map<number, number>();
  for (const line of serverLines) {
    merged.set(line.productId, clampQuantity(line.quantity, cap));
  }
  for (const line of guestLines) {
    const guestQty = clampQuantity(line.quantity, cap);
    const current = merged.get(line.productId) ?? 0;
    merged.set(line.productId, Math.max(current, guestQty));
  }
  return merged;
}
