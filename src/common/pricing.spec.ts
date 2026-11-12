import { compareAtPaise, effectivePricePaise, isSaleActive, PriceFields } from './pricing';

const NOW = new Date('2026-06-15T12:00:00Z');
const base: PriceFields = { listPricePaise: 1_800_000, salePricePaise: 1_449_000, saleStartsAt: null, saleEndsAt: null };

describe('sale pricing', () => {
  it('applies the sale price when there is no window', () => {
    expect(isSaleActive(base, NOW)).toBe(true);
    expect(effectivePricePaise(base, NOW)).toBe(1_449_000);
    expect(compareAtPaise(base, NOW)).toBe(1_800_000);
  });

  it('ignores a sale that has not started yet', () => {
    const p = { ...base, saleStartsAt: new Date('2026-07-01T00:00:00Z') };
    expect(effectivePricePaise(p, NOW)).toBe(1_800_000);
    expect(compareAtPaise(p, NOW)).toBeNull();
  });

  it('ignores a sale that has ended (end is exclusive)', () => {
    const p = { ...base, saleEndsAt: NOW };
    expect(isSaleActive(p, NOW)).toBe(false);
    expect(effectivePricePaise(p, NOW)).toBe(1_800_000);
  });

  it('ignores a sale price that is not below the list price', () => {
    expect(isSaleActive({ ...base, salePricePaise: 1_800_000 }, NOW)).toBe(false);
  });

  it('uses the list price when there is no sale price', () => {
    expect(effectivePricePaise({ ...base, salePricePaise: null }, NOW)).toBe(1_800_000);
  });
});
