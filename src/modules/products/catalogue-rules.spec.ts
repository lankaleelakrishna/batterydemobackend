import { parseCsv, pickAllowed, stockStatus, LOW_STOCK_THRESHOLD, KIND_VALUES, TECHNOLOGY_VALUES } from './catalogue-rules';

describe('stockStatus', () => {
  it('shows in stock, low stock, out of stock and pre-order', () => {
    expect(stockStatus(40, false)).toBe('in-stock');
    expect(stockStatus(LOW_STOCK_THRESHOLD, false)).toBe('low-stock');
    expect(stockStatus(0, false)).toBe('out-of-stock');
    expect(stockStatus(0, true)).toBe('preorder');
  });
});

describe('filter parsing', () => {
  it('splits comma lists and drops empties', () => {
    expect(parseCsv('battery, inverter,,')).toEqual(['battery', 'inverter']);
    expect(parseCsv(undefined)).toEqual([]);
  });

  it('keeps only known values, without duplicates', () => {
    expect(pickAllowed(['battery', 'battery', 'bogus'], KIND_VALUES)).toEqual(['battery']);
    expect(pickAllowed(['lithium-ion', 'nope'], TECHNOLOGY_VALUES)).toEqual(['lithium-ion']);
  });
});
