import { normalizeSearchText, slugify } from './text';

describe('slugify', () => {
  it('matches the storefront brand slug rule', () => {
    expect(slugify('Helio Grid')).toBe('helio-grid');
    expect(slugify('  Northwatt!! ')).toBe('northwatt');
    expect(slugify('Arcline & Co.')).toBe('arcline-co');
  });
});

describe('normalizeSearchText', () => {
  it('ignores spaces, hyphens, underscores and slashes, so "tt150" finds "TT-150"', () => {
    expect(normalizeSearchText('TT-150')).toBe('tt150');
    expect(normalizeSearchText('tt 150')).toBe('tt150');
    expect(normalizeSearchText('NW_LI/100')).toBe('nwli100');
  });
});
