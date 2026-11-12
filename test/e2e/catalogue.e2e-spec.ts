import { Harness, makeBrand, makeCategory, makeProduct, resetDatabase, startHarness } from './helpers';

describe('Catalogue (e2e)', () => {
  let h: Harness;
  let ids: Record<string, number> = {};

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.ds);
    const northwatt = await makeBrand(h.ds, 'Northwatt');
    const arcline = await makeBrand(h.ds, 'Arcline');
    const batteries = await makeCategory(h.ds, 'batteries');
    const tall = await makeCategory(h.ds, 'tall-tubular', batteries.id);
    const inverters = await makeCategory(h.ds, 'inverters');
    const lithium = await makeCategory(h.ds, 'lithium');

    const p1 = await makeProduct(h.ds, {
      slug: 'tt-150',
      name: 'TT 150 Tall Tubular',
      brandId: northwatt.id,
      categoryId: tall.id,
      modelNumber: 'NW-TT150',
      capacityAh: 150,
      warrantyMonths: 60,
      listPricePaise: 1_800_000,
      salePricePaise: 1_449_000,
      stockQuantity: 40,
      isFeatured: true,
      isBestSeller: true,
    });
    const p2 = await makeProduct(h.ds, {
      slug: 'tt-200',
      name: 'TT 200 Tall Tubular',
      brandId: northwatt.id,
      categoryId: tall.id,
      modelNumber: 'NW-TT200',
      capacityAh: 200,
      warrantyMonths: 72,
      listPricePaise: 2_150_000,
      stockQuantity: 3,
    });
    const p3 = await makeProduct(h.ds, {
      slug: 'li-100',
      name: 'Li 100 Lithium Home',
      brandId: arcline.id,
      categoryId: lithium.id,
      kind: 'battery',
      technology: 'lithium-ion',
      capacityAh: 100,
      warrantyMonths: 84,
      listPricePaise: 3_890_000,
      stockQuantity: 0,
      acceptsPreorders: true,
    });
    const p4 = await makeProduct(h.ds, {
      slug: 'sw-1100',
      name: 'Sine 1100 Inverter',
      brandId: arcline.id,
      categoryId: inverters.id,
      kind: 'inverter',
      technology: null,
      capacityAh: null,
      ratingVa: 1100,
      warrantyMonths: 24,
      listPricePaise: 860_000,
      salePricePaise: 729_000,
      stockQuantity: 10,
    });
    await makeProduct(h.ds, {
      slug: 'archived-fp-100',
      name: 'FP 100 Flat Plate',
      brandId: northwatt.id,
      categoryId: tall.id,
      capacityAh: 100,
      listPricePaise: 849_000,
      stockQuantity: 5,
      isActive: false,
    });
    ids = { p1: p1.id, p2: p2.id, p3: p3.id, p4: p4.id };
  });

  const names = (body: { data: { name: string }[] }) => body.data.map((p) => p.name);

  it('lists only active products with paging metadata', async () => {
    const res = await h.http().get('/products').expect(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 12, total: 4, pages: 1 });
    expect(names(res.body)).not.toContain('FP 100 Flat Plate');
  });

  it('filters by product type and manufacturer', async () => {
    expect(names((await h.http().get('/products?type=battery').expect(200)).body).length).toBe(3);
    expect(names((await h.http().get('/products?brand=arcline').expect(200)).body).sort()).toEqual(['Li 100 Lithium Home', 'Sine 1100 Inverter']);
  });

  it('filters by capacity bucket, technology and warranty', async () => {
    expect(names((await h.http().get('/products?capacity=150-199').expect(200)).body)).toEqual(['TT 150 Tall Tubular']);
    expect(names((await h.http().get('/products?capacity=200-plus').expect(200)).body)).toEqual(['TT 200 Tall Tubular']);
    expect(names((await h.http().get('/products?tech=lithium-ion').expect(200)).body)).toEqual(['Li 100 Lithium Home']);
    expect(names((await h.http().get('/products?warranty=36').expect(200)).body).sort()).toEqual(['Li 100 Lithium Home', 'TT 150 Tall Tubular', 'TT 200 Tall Tubular']);
  });

  it('filters by price bucket using the sale price when a sale is active', async () => {
    // TT 150 is on sale at Rs 14,490, inside the 10k-20k bucket. The others fall outside it.
    expect(names((await h.http().get('/products?price=10k-20k').expect(200)).body)).toEqual(['TT 150 Tall Tubular']);
  });

  it('combines filters with AND across groups and OR within a group', async () => {
    const res = await h.http().get('/products?type=battery&capacity=100-149,200-plus&stock=1').expect(200);
    expect(names(res.body).sort()).toEqual(['TT 200 Tall Tubular']);
  });

  it('excludes out-of-stock and pre-order products when stock=1', async () => {
    const res = await h.http().get('/products?stock=1').expect(200);
    expect(names(res.body)).not.toContain('Li 100 Lithium Home');
  });

  it('sorts by effective price in both directions', async () => {
    expect(names((await h.http().get('/products?sort=price-asc').expect(200)).body)).toEqual([
      'Sine 1100 Inverter',
      'TT 150 Tall Tubular',
      'TT 200 Tall Tubular',
      'Li 100 Lithium Home',
    ]);
    expect(names((await h.http().get('/products?sort=price-desc').expect(200)).body)[0]).toBe('Li 100 Lithium Home');
  });

  it('searches with spacing and hyphens ignored, across name, model and brand', async () => {
    expect(names((await h.http().get('/products?q=tt150').expect(200)).body)).toEqual(['TT 150 Tall Tubular']);
    expect(names((await h.http().get('/products?q=TT-150').expect(200)).body)).toEqual(['TT 150 Tall Tubular']);
    expect(names((await h.http().get('/products?q=arcline').expect(200)).body).sort()).toEqual(['Li 100 Lithium Home', 'Sine 1100 Inverter']);
    expect(names((await h.http().get('/products?q=tall%20tubular').expect(200)).body).sort()).toEqual(['TT 150 Tall Tubular', 'TT 200 Tall Tubular']);
  });

  it('includes subcategories when filtering by a parent category', async () => {
    const res = await h.http().get('/products?category=batteries').expect(200);
    expect(names(res.body).sort()).toEqual(['TT 150 Tall Tubular', 'TT 200 Tall Tubular']);
  });

  it('paginates with page and limit', async () => {
    const page2 = await h.http().get('/products?sort=price-asc&limit=2&page=2').expect(200);
    expect(names(page2.body)).toEqual(['TT 200 Tall Tubular', 'Li 100 Lithium Home']);
    expect(page2.body.meta).toEqual({ page: 2, limit: 2, total: 4, pages: 2 });
  });

  it('returns facet counts across the whole active catalogue', async () => {
    const res = await h.http().get('/products/facets').expect(200);
    const kinds = Object.fromEntries(res.body.kinds.map((k: { value: string; count: number }) => [k.value, k.count]));
    expect(kinds).toEqual({ battery: 3, inverter: 1 });
    const brands = Object.fromEntries(res.body.brands.map((b: { key: string; count: number }) => [b.key, b.count]));
    expect(brands).toEqual({ arcline: 2, northwatt: 2 });
  });

  it('returns a product by slug with storefront pricing, and 404 for unknown or archived slugs', async () => {
    const res = await h.http().get('/products/tt-150').expect(200);
    expect(res.body.price.current.amount).toBe(14490);
    expect(res.body.price.compareAt.amount).toBe(18000);
    expect(res.body.brand).toBe('Northwatt');
    expect(res.body.badges).toEqual(['featured', 'bestseller']);
    expect(res.body.stock).toBe('in-stock');
    await h.http().get('/products/archived-fp-100').expect(404);
    const missing = await h.http().get('/products/nope').expect(404);
    expect(missing.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('returns the ids requested for compare and wishlist views', async () => {
    const res = await h.http().get(`/products?ids=${ids.p1},${ids.p4}`).expect(200);
    expect(names(res.body).sort()).toEqual(['Sine 1100 Inverter', 'TT 150 Tall Tubular']);
  });

  it('serves featured and best-seller lists as plain arrays', async () => {
    const featured = await h.http().get('/products/featured').expect(200);
    expect(Array.isArray(featured.body)).toBe(true);
    expect(names({ data: featured.body })).toEqual(['TT 150 Tall Tubular']);
    const best = await h.http().get('/products/best-sellers').expect(200);
    expect(names({ data: best.body })).toEqual(['TT 150 Tall Tubular']);
  });

  it('suggests products and matching manufacturers for the search panel', async () => {
    const res = await h.http().get('/products/suggest?q=arc').expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.brands).toEqual([{ key: 'arcline', label: 'Arcline' }]);
    expect(res.body.products.length).toBeLessThanOrEqual(5);
  });

  it('rejects malformed query values with a field-level message', async () => {
    const res = await h.http().get('/products?limit=500&sort=bogus').expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details.fields.length).toBeGreaterThan(0);
  });

  it('returns categories with product counts, and subcategories on request', async () => {
    const top = await h.http().get('/categories').expect(200);
    expect(top.body.map((c: { slug: string }) => c.slug).sort()).toEqual(['batteries', 'inverters', 'lithium']);
    const batteries = top.body.find((c: { slug: string }) => c.slug === 'batteries');
    expect(batteries.productCount).toBe(2);
    const subs = await h.http().get('/categories?parent=batteries').expect(200);
    expect(subs.body.map((c: { slug: string }) => c.slug)).toEqual(['tall-tubular']);
  });
});
