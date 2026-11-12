import { percentOfPaise, roundPaise, toRupees } from './money';

describe('money (integer paise)', () => {
  it('converts paise to rupees without float drift', () => {
    expect(toRupees(1449000)).toBe(14490);
    expect(toRupees(1)).toBe(0.01);
  });

  it('computes basis-point percentages on paise, rounded to the nearest paisa', () => {
    expect(percentOfPaise(1449000, 1800)).toBe(260820); // 18% of Rs 14,490
    expect(percentOfPaise(10000, 1250)).toBe(1250); // 12.5%
    expect(percentOfPaise(333, 5000)).toBe(167); // 166.5 rounds up
  });

  it('rounds to whole paise', () => {
    expect(roundPaise(10.4)).toBe(10);
    expect(roundPaise(10.5)).toBe(11);
  });
});
