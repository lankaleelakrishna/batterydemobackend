import { toProductView, ProductWithRelations } from './product.view';

function product(overrides: Partial<ProductWithRelations> = {}): ProductWithRelations {
  return {
    id: 5,
    slug: 'demo-x',
    kind: 'battery',
    brandId: 1,
    categoryId: 2,
    modelNumber: 'NW-1',
    name: 'Demo battery',
    tagline: null,
    technology: 'tall-tubular',
    capacityAh: 150,
    ratingVa: null,
    warrantyMonths: 60,
    lengthMm: 500,
    widthMm: 190,
    heightMm: 260,
    weightKg: 41.5,
    listPricePaise: 1_800_000,
    salePricePaise: 1_449_000,
    saleStartsAt: null,
    saleEndsAt: null,
    stockQuantity: 3,
    acceptsPreorders: false,
    isFeatured: true,
    isBestSeller: false,
    brand: { name: 'Northwatt' } as ProductWithRelations['brand'],
    category: { slug: 'tall-tubular' } as ProductWithRelations['category'],
    ...overrides,
  } as ProductWithRelations;
}

describe('toProductView (matches the frontend Product type)', () => {
  it('reports the manufacturer brand, not the retailer', () => {
    const v = toProductView(product(), { images: [], specs: [] });
    expect(v.brand).toBe('Northwatt');
    expect(v.id).toBe('5');
  });

  it('shows the sale price as current and the list price as compareAt, in rupees', () => {
    const v = toProductView(product(), { images: [], specs: [], now: new Date('2026-06-15T00:00:00Z') });
    expect(v.price.current).toEqual({ amount: 14490, currency: 'INR' });
    expect(v.price.compareAt).toEqual({ amount: 18000, currency: 'INR' });
  });

  it('omits optional fields that are not set, rather than sending null', () => {
    const v = toProductView(product({ tagline: null, ratingVa: null, weightKg: null }), { images: [], specs: [] });
    expect(v).not.toHaveProperty('tagline');
    expect(v).not.toHaveProperty('ratingVA');
    expect(v).not.toHaveProperty('weightKg');
    expect(v.dimensionsMm).toEqual({ length: 500, width: 190, height: 260 });
  });

  it('maps stock to the storefront status and flags to badges', () => {
    const v = toProductView(product(), { images: [], specs: [] });
    expect(v.stock).toBe('low-stock');
    expect(v.badges).toEqual(['featured']);
  });

  it('only includes a rating once there are approved reviews', () => {
    expect(toProductView(product(), { images: [], specs: [] })).not.toHaveProperty('rating');
    const rated = toProductView(product(), { images: [], specs: [], rating: { average: 4.5, count: 2 } });
    expect(rated.rating).toEqual({ average: 4.5, count: 2 });
  });
});
