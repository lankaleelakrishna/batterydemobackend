import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Harness, addAddress, makeAdminSession, makeBrand, makeCategory, makeProduct, registerCustomer, resetDatabase, setStock, startHarness } from './helpers';

/**
 * Test fixtures for checkout (see test/e2e/env.ts): shipping Rs 50, GST 18% added on top,
 * COD enabled, delivery to pincodes 500001 and 560001.
 */

describe('Checkout and orders (e2e)', () => {
  let h: Harness;
  let p1: number;
  let p4: number;
  let p2: number;
  let token: string;
  let addressId: number;

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
    p4 = (await makeProduct(h.ds, { slug: 'sw-1100', brandId: brand.id, categoryId: cat.id, kind: 'inverter', technology: null, capacityAh: null, ratingVa: 1100, listPricePaise: 860_000, salePricePaise: 729_000, stockQuantity: 10 })).id;
    p2 = (await makeProduct(h.ds, { slug: 'tt-200', brandId: brand.id, categoryId: cat.id, listPricePaise: 2_150_000, stockQuantity: 3 })).id;
    token = (await registerCustomer(h, 'buyer@example.com')).token;
    addressId = await addAddress(h, token, '500001');
  });

  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const key = () => randomUUID();

  async function fillCart(items: { productId: number; quantity: number }[], t = token) {
    for (const item of items) {
      await h.http().put(`/cart/items/${item.productId}`).set(auth(t)).send({ quantity: item.quantity }).expect(200);
    }
  }

  async function stockOf(productId: number): Promise<number> {
    const [row] = await (h.ds as DataSource).query(`SELECT stock_quantity FROM products WHERE id = $1`, [productId]);
    return row.stock_quantity;
  }

  describe('quote', () => {
    it('computes the total on the server from current prices, with shipping and exclusive GST', async () => {
      await fillCart([
        { productId: p1, quantity: 2 },
        { productId: p4, quantity: 1 },
      ]);
      const res = await h.http().post('/orders/quote').set(auth()).send({ addressId, paymentMethod: 'cod' }).expect(200);
      // Subtotal: 2 x Rs 14,490 + Rs 7,290 = Rs 36,270. Shipping Rs 50. GST 18% = Rs 6,528.60.
      expect(res.body.subtotal).toBe(36270);
      expect(res.body.shipping).toBe(50);
      expect(res.body.tax).toBe(6528.6);
      expect(res.body.total).toBe(42848.6);
      expect(res.body.gstMode).toBe('exclusive');
    });

    it('does not change stock or the cart', async () => {
      await fillCart([{ productId: p1, quantity: 1 }]);
      await h.http().post('/orders/quote').set(auth()).send({ addressId, paymentMethod: 'cod' }).expect(200);
      expect(await stockOf(p1)).toBe(40);
      const cart = await h.http().get('/cart').set(auth()).expect(200);
      expect(cart.body.totals.itemCount).toBe(1);
    });
  });

  describe('placing an order', () => {
    it('requires an Idempotency-Key header', async () => {
      await fillCart([{ productId: p1, quantity: 1 }]);
      const res = await h.http().post('/orders').set(auth()).send({ addressId, paymentMethod: 'cod' }).expect(400);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('refuses any client-supplied price or total', async () => {
      await fillCart([{ productId: p1, quantity: 1 }]);
      const res = await h
        .http()
        .post('/orders')
        .set(auth())
        .set('Idempotency-Key', key())
        .send({ addressId, paymentMethod: 'cod', totalPaise: 100, items: [{ productId: p1, price: 1 }] })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('refuses payment methods that are not offered', async () => {
      await fillCart([{ productId: p1, quantity: 1 }]);
      await h.http().post('/orders').set(auth()).set('Idempotency-Key', key()).send({ addressId, paymentMethod: 'card' }).expect(400);
    });

    it('places an order from the server-side cart, snapshots the lines and empties the cart', async () => {
      await fillCart([
        { productId: p1, quantity: 2 },
        { productId: p4, quantity: 1 },
      ]);
      const res = await h.http().post('/orders').set(auth()).set('Idempotency-Key', key()).send({ addressId, paymentMethod: 'cod' }).expect(201);
      expect(res.body.replayed).toBe(false);
      const order = res.body.order;
      expect(order.orderNumber).toMatch(/^VLT-\d{8}-[0-9A-F]{8}$/);
      expect(order.status).toBe('placed');
      expect(order.paymentStatus).toBe('unpaid');
      expect(order.total).toBe(42848.6);
      expect(order.items.map((i: { productName: string; unitPrice: number; quantity: number }) => [i.productName, i.unitPrice, i.quantity])).toEqual([
        ['tt-150', 14490, 2],
        ['sw-1100', 7290, 1],
      ]);
      expect(order.shippingAddress.pincode).toBe('500001');

      expect(await stockOf(p1)).toBe(38);
      expect(await stockOf(p4)).toBe(9);
      const cart = await h.http().get('/cart').set(auth()).expect(200);
      expect(cart.body.items).toEqual([]);

      const movements = await (h.ds as DataSource).query(`SELECT product_id, delta, reason FROM inventory_movements WHERE reason = 'order' ORDER BY product_id`);
      expect(movements.map((m: { delta: number }) => m.delta).sort((a: number, b: number) => a - b)).toEqual([-2, -1]);
    });

    it('returns the same order for a retried request, without taking stock twice', async () => {
      await fillCart([{ productId: p1, quantity: 1 }]);
      const k = key();
      const first = await h.http().post('/orders').set(auth()).set('Idempotency-Key', k).send({ addressId, paymentMethod: 'cod' }).expect(201);
      const retry = await h.http().post('/orders').set(auth()).set('Idempotency-Key', k).send({ addressId, paymentMethod: 'cod' }).expect(201);
      expect(retry.body.replayed).toBe(true);
      expect(retry.body.order.id).toBe(first.body.order.id);
      expect(await stockOf(p1)).toBe(39);
      const count = await (h.ds as DataSource).query(`SELECT COUNT(*)::int AS n FROM orders`);
      expect(count[0].n).toBe(1);
    });

    it('refuses a reused key for a different request, and keeps replaying the original', async () => {
      await fillCart([{ productId: p1, quantity: 1 }]);
      const otherAddress = await addAddress(h, token, '560001');
      const k = key();
      const first = await h.http().post('/orders').set(auth()).set('Idempotency-Key', k).send({ addressId, paymentMethod: 'cod' }).expect(201);
      const reused = await h.http().post('/orders').set(auth()).set('Idempotency-Key', k).send({ addressId: otherAddress, paymentMethod: 'cod' }).expect(422);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      const replay = await h.http().post('/orders').set(auth()).set('Idempotency-Key', k).send({ addressId, paymentMethod: 'cod' }).expect(201);
      expect(replay.body.replayed).toBe(true);
      expect(replay.body.order.id).toBe(first.body.order.id);
    });

    it('refuses an order when the cart asks for more than is in stock, and says how much is left', async () => {
      await fillCart([{ productId: p2, quantity: 4 }]);
      const res = await h.http().post('/orders').set(auth()).set('Idempotency-Key', key()).send({ addressId, paymentMethod: 'cod' }).expect(409);
      expect(res.body.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.details.items).toEqual([{ productId: String(p2), name: 'tt-200', requested: 4, available: 3 }]);
      expect(await stockOf(p2)).toBe(3);
    });

    it('refuses an order that includes an archived product', async () => {
      await fillCart([{ productId: p1, quantity: 1 }]);
      const admin = await makeAdminSession(h);
      await h.http().post(`/admin/products/${p1}/archive`).set('Authorization', `Bearer ${admin}`).expect(200);
      const res = await h.http().post('/orders').set(auth()).set('Idempotency-Key', key()).send({ addressId, paymentMethod: 'cod' }).expect(409);
      expect(res.body.code).toBe('PRODUCT_UNAVAILABLE');
    });

    it('refuses an empty cart', async () => {
      const res = await h.http().post('/orders').set(auth()).set('Idempotency-Key', key()).send({ addressId, paymentMethod: 'cod' }).expect(422);
      expect(res.body.code).toBe('CART_EMPTY');
    });

    it('refuses delivery outside the serviceable pincodes', async () => {
      const far = await addAddress(h, token, '999999');
      await fillCart([{ productId: p1, quantity: 1 }]);
      const res = await h.http().post('/orders').set(auth()).set('Idempotency-Key', key()).send({ addressId: far, paymentMethod: 'cod' }).expect(422);
      expect(res.body.code).toBe('DELIVERY_UNAVAILABLE');
      expect(await stockOf(p1)).toBe(40);
    });

    it('does not let one customer use another customer\'s address', async () => {
      const other = await registerCustomer(h, 'intruder@example.com');
      await fillCart([{ productId: p1, quantity: 1 }], other.token);
      await h.http().post('/orders').set(auth(other.token)).set('Idempotency-Key', key()).send({ addressId, paymentMethod: 'cod' }).expect(404);
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of two customers buy the last unit', async () => {
      await setStock(h.ds, p2, 1);
      const a = token;
      const b = (await registerCustomer(h, 'rival@example.com')).token;
      const bAddress = await addAddress(h, b, '500001');
      await fillCart([{ productId: p2, quantity: 1 }], a);
      await fillCart([{ productId: p2, quantity: 1 }], b);

      const [ra, rb] = await Promise.all([
        h.http().post('/orders').set(auth(a)).set('Idempotency-Key', key()).send({ addressId, paymentMethod: 'cod' }),
        h.http().post('/orders').set(auth(b)).set('Idempotency-Key', key()).send({ addressId: bAddress, paymentMethod: 'cod' }),
      ]);
      const statuses = [ra.status, rb.status].sort();
      expect(statuses).toEqual([201, 409]);
      expect(await stockOf(p2)).toBe(0);
      const orders = await (h.ds as DataSource).query(`SELECT COUNT(*)::int AS n FROM orders`);
      expect(orders[0].n).toBe(1);
    });

    it('returns one order when the same request is sent twice at the same moment', async () => {
      await fillCart([{ productId: p1, quantity: 1 }]);
      const k = key();
      const [r1, r2] = await Promise.all([
        h.http().post('/orders').set(auth()).set('Idempotency-Key', k).send({ addressId, paymentMethod: 'cod' }),
        h.http().post('/orders').set(auth()).set('Idempotency-Key', k).send({ addressId, paymentMethod: 'cod' }),
      ]);
      expect([r1.status, r2.status]).toEqual([201, 201]);
      expect(r1.body.order.id).toBe(r2.body.order.id);
      expect([r1.body.replayed, r2.body.replayed].sort()).toEqual([false, true]);
      expect(await stockOf(p1)).toBe(39);
    });
  });

  describe('order history', () => {
    it('lists and shows only the customer\'s own orders', async () => {
      await fillCart([{ productId: p1, quantity: 1 }]);
      const placed = await h.http().post('/orders').set(auth()).set('Idempotency-Key', key()).send({ addressId, paymentMethod: 'cod' }).expect(201);
      const list = await h.http().get('/orders').set(auth()).expect(200);
      expect(list.body.data.map((o: { id: number }) => o.id)).toEqual([placed.body.order.id]);
      expect(list.body.meta.total).toBe(1);

      const other = await registerCustomer(h, 'nosy@example.com');
      await h.http().get(`/orders/${placed.body.order.id}`).set(auth(other.token)).expect(404);
      const mine = await h.http().get(`/orders/${placed.body.order.id}`).set(auth()).expect(200);
      expect(mine.body.total).toBe(placed.body.order.total);
    });
  });

  describe('store settings', () => {
    it('exposes which rules are configured, without secrets', async () => {
      const res = await h.http().get('/store/settings').expect(200);
      expect(res.body).toEqual({
        codEnabled: true,
        shippingFee: 50,
        gst: { ratePercent: 18, mode: 'exclusive' },
        minimumOrder: null,
        deliveryConfigured: true,
        checkoutReady: true,
      });
      expect((await h.http().get('/store/pincodes/500001').expect(200)).body.serviceable).toBe(true);
      expect((await h.http().get('/store/pincodes/999999').expect(200)).body.serviceable).toBe(false);
    });
  });
});
