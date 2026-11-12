import { clampQuantity, mergeCartQuantities } from './cart-merge';

describe('mergeCartQuantities', () => {
  it('combines identical product ids into one line, taking the larger quantity', () => {
    const merged = mergeCartQuantities([{ productId: 7, quantity: 2 }], [{ productId: 7, quantity: 5 }, { productId: 7, quantity: 1 }], 10);
    expect(merged.get(7)).toBe(5);
    expect(merged.size).toBe(1);
  });

  it('keeps server-only and guest-only lines', () => {
    const merged = mergeCartQuantities([{ productId: 1, quantity: 3 }], [{ productId: 2, quantity: 4 }], 10);
    expect(merged.get(1)).toBe(3);
    expect(merged.get(2)).toBe(4);
  });

  it('caps quantities at the maximum', () => {
    const merged = mergeCartQuantities([], [{ productId: 9, quantity: 50 }], 10);
    expect(merged.get(9)).toBe(10);
  });

  it('is idempotent: merging the same guest cart twice gives the same result', () => {
    const guest = [{ productId: 3, quantity: 2 }];
    const once = mergeCartQuantities([], guest, 10);
    const twice = mergeCartQuantities([...once].map(([productId, quantity]) => ({ productId, quantity })), guest, 10);
    expect([...twice]).toEqual([...once]);
  });
});

describe('clampQuantity', () => {
  it('keeps quantities between 1 and the cap', () => {
    expect(clampQuantity(0, 10)).toBe(1);
    expect(clampQuantity(-4, 10)).toBe(1);
    expect(clampQuantity(3.9, 10)).toBe(3);
    expect(clampQuantity(99, 10)).toBe(10);
    expect(clampQuantity(NaN, 10)).toBe(1);
  });
});
