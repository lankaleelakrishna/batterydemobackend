import { AppError } from '../../common/errors';
import { validateKindRules } from './product-admin.service';

const base = {
  kind: 'battery' as const,
  technology: 'tall-tubular',
  capacityAh: 150,
  ratingVa: null,
  listPricePaise: 1_800_000,
  salePricePaise: null,
  saleStartsAt: null,
  saleEndsAt: null,
};

function problemsOf(state: Parameters<typeof validateKindRules>[0]): string[] {
  try {
    validateKindRules(state);
    return [];
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return (err as AppError).details?.problems as string[];
  }
}

describe('validateKindRules', () => {
  it('accepts a complete battery', () => {
    expect(problemsOf(base)).toEqual([]);
  });

  it('requires technology and capacity for batteries, and no inverter rating', () => {
    expect(problemsOf({ ...base, technology: null, capacityAh: null, ratingVa: 1100 })).toEqual(
      expect.arrayContaining(['Batteries need a battery technology.', 'Batteries need a capacity in Ah.', 'Batteries do not have an inverter rating in VA.']),
    );
  });

  it('requires a VA rating for inverters and no battery fields', () => {
    expect(problemsOf({ ...base, kind: 'inverter', technology: 'lithium-ion', capacityAh: 100, ratingVa: null })).toEqual(
      expect.arrayContaining(['Inverters need a rating in VA.', 'Inverters do not have a battery technology.', 'Inverters do not have a capacity in Ah.']),
    );
    expect(problemsOf({ ...base, kind: 'inverter', technology: null, capacityAh: null, ratingVa: 1100 })).toEqual([]);
  });

  it('requires the sale price to be below the list price', () => {
    expect(problemsOf({ ...base, salePricePaise: 1_800_000 })).toEqual(['The sale price must be lower than the list price.']);
  });

  it('requires a sale end after the sale start, and a sale price for any window', () => {
    const start = new Date('2026-06-02T00:00:00Z');
    expect(problemsOf({ ...base, salePricePaise: 1_000_000, saleStartsAt: start, saleEndsAt: start })).toEqual(['The sale must end after it starts.']);
    expect(problemsOf({ ...base, saleStartsAt: start })).toEqual(['A sale window needs a sale price.']);
  });
});
