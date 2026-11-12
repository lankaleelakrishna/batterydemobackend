import { Harness, makeBrand, makeCategory, makeProduct, registerCustomer, resetDatabase, startHarness } from './helpers';

describe('Cart and wishlist (e2e)', () => {
  let h: Harness;
  let p1: number;
  let p4: number;
  let archived: number;
  let token: string;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.ds);
    const brand = await makeBrand(h.ds, 'Northwatt');
    const cat = await makeCategory(h.ds, 'batteries');
    p1 = (await makeProduct(h.ds, { slug: 'tt-150', brandId: brand.id, categoryId: cat.id, listPricePaise: 1_800_000, salePricePaise: 1_449_000, stockQuantity: 40 })).id;
    p4 = (await makeProduct(h.ds, { slug: 'sw-1100', brandId: brand.id, categoryId: cat.id, kind: 'inverter', technology: null, capacityAh: null, ratingVa: 1100, listPricePaise: 860_000, stockQuantity: 10 })).id;
    archived = (await makeProduct(h.ds, { slug: 'old-model', brandId: brand.id, categoryId: cat.id, stockQuantity: 5, isActive: false })).id;
    token = (await registerCustomer(h, 'cart@example.com')).token;
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('starts empty', async () => {
    const res = await h.http().get('/cart').set(auth()).expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.totals).toEqual({ itemCount: 0, subtotal: 0, savings: 0 });
  });

  it('sets a quantity and prices the line from the server (sale price, savings against list)', async () => {
    const res = await h.http().put(`/cart/items/${p1}`).set(auth()).send({ quantity: 2 }).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].product.price.current.amount).toBe(14490);
    expect(res.body.items[0].lineTotal).toBe(28980);
    // Savings: (Rs 18,000 list - Rs 14,490 sale) x 2 = Rs 7,020.
    expect(res.body.totals).toEqual({ itemCount: 2, subtotal: 28980, savings: 7020 });
  });

  it('replaces the quantity rather than adding to it', async () => {
    await h.http().put(`/cart/items/${p1}`).set(auth()).send({ quantity: 2 }).expect(200);
    const res = await h.http().put(`/cart/items/${p1}`).set(auth()).send({ quantity: 3 }).expect(200);
    expect(res.body.totals.itemCount).toBe(3);
  });

  it('caps quantity at 10 and refuses anything outside 1–10', async () => {
    await h.http().put(`/cart/items/${p1}`).set(auth()).send({ quantity: 11 }).expect(400);
    await h.http().put(`/cart/items/${p1}`).set(auth()).send({ quantity: 0 }).expect(400);
  });

  it('will not add an archived or unknown product', async () => {
    const res = await h.http().put(`/cart/items/${archived}`).set(auth()).send({ quantity: 1 }).expect(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
    await h.http().put('/cart/items/999999').set(auth()).send({ quantity: 1 }).expect(404);
  });

  it('removes a line', async () => {
    await h.http().put(`/cart/items/${p1}`).set(auth()).send({ quantity: 1 }).expect(200);
    const res = await h.http().delete(`/cart/items/${p1}`).set(auth()).expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('merges a guest cart: one line per product, larger quantity wins, archived items skipped', async () => {
    await h.http().put(`/cart/items/${p1}`).set(auth()).send({ quantity: 2 }).expect(200);
    const res = await h
      .http()
      .post('/cart/merge')
      .set(auth())
      .send({
        items: [
          { productId: p1, quantity: 5 },
          { productId: p1, quantity: 1 },
          { productId: p4, quantity: 1 },
          { productId: archived, quantity: 2 },
        ],
      })
      .expect(201);
    expect(res.body.items.map((i: { quantity: number }) => i.quantity).sort()).toEqual([1, 5]);
    expect(res.body.skipped).toBe(1);
    expect(res.body.items.map((i: { productId: string }) => i.productId).sort()).toEqual([String(p1), String(p4)].sort());
  });

  it('is idempotent: merging the same guest cart twice does not change the result', async () => {
    const body = { items: [{ productId: p1, quantity: 3 }, { productId: p4, quantity: 2 }] };
    const first = await h.http().post('/cart/merge').set(auth()).send(body).expect(201);
    const second = await h.http().post('/cart/merge').set(auth()).send(body).expect(201);
    expect(second.body.totals).toEqual(first.body.totals);
    expect(second.body.items).toHaveLength(2);
  });

  it('caps merged quantities at 10', async () => {
    const res = await h.http().post('/cart/merge').set(auth()).send({ items: [{ productId: p1, quantity: 10 }, { productId: p1, quantity: 10 }] }).expect(201);
    expect(res.body.items[0].quantity).toBe(10);
  });

  it('refuses client-supplied prices in a merge', async () => {
    const res = await h.http().post('/cart/merge').set(auth()).send({ items: [{ productId: p1, quantity: 1, price: 1 }] }).expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('requires a signed-in customer', async () => {
    await h.http().get('/cart').expect(401);
  });

  it('keeps each customer\'s cart separate', async () => {
    await h.http().put(`/cart/items/${p1}`).set(auth()).send({ quantity: 4 }).expect(200);
    const other = (await registerCustomer(h, 'other-cart@example.com')).token;
    const res = await h.http().get('/cart').set('Authorization', `Bearer ${other}`).expect(200);
    expect(res.body.items).toEqual([]);
  });
});

describe('Wishlist (e2e)', () => {
  let h: Harness;
  let p1: number;
  let p4: number;
  let archived: number;
  let token: string;

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.ds);
    const brand = await makeBrand(h.ds, 'Northwatt');
    const cat = await makeCategory(h.ds, 'batteries');
    p1 = (await makeProduct(h.ds, { slug: 'tt-150', brandId: brand.id, categoryId: cat.id })).id;
    p4 = (await makeProduct(h.ds, { slug: 'sw-1100', brandId: brand.id, categoryId: cat.id, kind: 'inverter', technology: null, capacityAh: null, ratingVa: 1100 })).id;
    archived = (await makeProduct(h.ds, { slug: 'old-model', brandId: brand.id, categoryId: cat.id, isActive: false })).id;
    token = (await registerCustomer(h, 'wish@example.com')).token;
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('saves a product once, however many times it is requested', async () => {
    await h.http().put(`/wishlist/${p1}`).set(auth()).expect(200);
    const res = await h.http().put(`/wishlist/${p1}`).set(auth()).expect(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('merges a guest wishlist without duplicates and ignores archived products', async () => {
    await h.http().put(`/wishlist/${p1}`).set(auth()).expect(200);
    const res = await h.http().post('/wishlist/merge').set(auth()).send({ productIds: [p1, p4, p1, archived] }).expect(201);
    expect(res.body.data.map((p: { id: string }) => p.id).sort()).toEqual([String(p1), String(p4)].sort());
  });

  it('removes a saved product', async () => {
    await h.http().put(`/wishlist/${p1}`).set(auth()).expect(200);
    const res = await h.http().delete(`/wishlist/${p1}`).set(auth()).expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('will not save an archived product', async () => {
    const res = await h.http().put(`/wishlist/${archived}`).set(auth()).expect(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });
});
