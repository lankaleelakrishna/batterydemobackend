/**
 * Money is stored as integer paise (1 rupee = 100 paise) to avoid floating
 * point error. The API returns rupee amounts as numbers, matching the
 * frontend's `Money` type.
 */

export function toRupees(paise: number): number {
  return Math.round(paise) / 100;
}

/** Rounds to the nearest paisa. Half-up for positive values. */
export function roundPaise(value: number): number {
  return Math.round(value);
}

/** Percentage of an amount in paise, using basis points (1 bp = 0.01%). */
export function percentOfPaise(amountPaise: number, basisPoints: number): number {
  return Math.round((amountPaise * basisPoints) / 10_000);
}
