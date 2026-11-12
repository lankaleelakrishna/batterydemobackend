import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { Harness, addAddress, makeAdminSession, makeBrand, makeCategory, makeProduct, registerCustomer, resetDatabase, startHarness, setStock } from './helpers';

describe('Admin product, inventory, content and order management (e2e)', () => {
  let h: Harness;
  let admin: string;
  let brandId: number;
  let batteryCat: number;
  let inverterCat: number;
  let comboCat: number;

  const as = () => ({ Authorization: `Bearer ${admin}` });

  beforeAll(async () => {
    h = await startHarness();
  });

  afterAll(async () => {
    await h.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(h.ds);
    admin = await makeAdminSession(h);
    brandId = (await makeBrand(h.ds, 'Northwatt')).id;
    batteryCat = (await makeCategory(h.ds, 'batteries')).id;
    inverterCat = (await makeCategory(h.ds, 'inverters')).id;
    comboCat = (await makeCategory(h.ds, 'combos')).id;
  });

  const battery = (overrides: Record<string, unknown> = {}) => ({
    kind: 'battery',
    brandId,
    categoryId: batteryCat,
    modelNumber: 'NW-TT150',
    name: 'TT 150 Tall Tubular',
    technology: 'tall-tubular',
    capacityAh: 150,
    warrantyMonths: 60,
    listPricePaise: 1_800_000,
    salePricePaise: 1_449_000,
    specs: [{ label: 'Voltage', value: '12 V' }],
    ...overrides,
  });

  describe('products', () => {
    it('refuses products without the fields their kind needs', async () => {
      const res = await h.http().post('/admin/products').set(as()).send(battery({ technology: undefined, capacityAh: undefined })).expect(422);
      expect(res.body.code).toBe('PRODUCT_RULES');
      expect(res.body.details.problems).toEqual(
        expect.arrayContaining(['Batteries need a battery technology.', 'Batteries need a capacity in Ah.']),
      );
    });

    it('refuses a sale price that is not below the list price', async () => {
      const res = await h.http().post('/admin/products').set(as()).send(battery({ salePricePaise: 2_000_000 })).expect(422);
      expect(res.body.details.problems).toContain('The sale price must be lower than the list price.');
    });

    it('creates a product with a derived slug, specs and initial stock recorded as a movement', async () => {
      const res = await h.http().post('/admin/products').set(as()).send(battery({ initialStock: 12 })).expect(201);
      expect(res.body.slug).toBe('tt-150-tall-tubular-nw-tt150');
      expect(res.body.stockQuantity).toBe(12);
      expect(res.body.specs).toEqual([{ label: 'Voltage', value: '12 V' }]);
      const movements = await h.http().get(`/admin/inventory-movements?productId=${res.body.id}`).set(as()).expect(200);
      expect(movements.body.data).toEqual([expect.objectContaining({ delta: 12, reason: 'adjustment', note: 'Initial stock' })]);
    });

    it('does not allow two products with the same slug', async () => {
      await h.http().post('/admin/products').set(as()).send(battery({ slug: 'tt-150' })).expect(201);
      const res = await h.http().post('/admin/products').set(as()).send(battery({ slug: 'tt-150' })).expect(409);
      expect(res.body.code).toBe('SLUG_OR_SKU_TAKEN');
    });

    it('updates prices and specs, and re-checks the kind rules on update', async () => {
      const created = await h.http().post('/admin/products').set(as()).send(battery({ slug: 'tt-150' })).expect(201);
      const updated = await h.http().put(`/admin/products/${created.body.id}`).set(as()).send({ listPricePaise: 1_900_000, specs: [{ label: 'Weight', value: '41 kg' }] }).expect(200);
      expect(updated.body.listPricePaise).toBe(1_900_000);
      expect(updated.body.specs.map((s: { label: string }) => s.label)).toEqual(['Weight']);

      const bad = await h.http().put(`/admin/products/${created.body.id}`).set(as()).send({ kind: 'inverter' }).expect(422);
      expect(bad.body.details.problems).toEqual(expect.arrayContaining(['Inverters need a rating in VA.']));
    });

    it('archives a product (hidden from the storefront) and restores it', async () => {
      const created = await h.http().post('/admin/products').set(as()).send(battery({ slug: 'tt-150' })).expect(201);
      await h.http().get('/products/tt-150').expect(200);
      await h.http().post(`/admin/products/${created.body.id}/archive`).set(as()).expect(200);
      await h.http().get('/products/tt-150').expect(404);
      await h.http().post(`/admin/products/${created.body.id}/restore`).set(as()).expect(200);
      await h.http().get('/products/tt-150').expect(200);
    });

    it('lists products for the admin with stock, including archived ones when asked', async () => {
      await makeProduct(h.ds, { slug: 'live', brandId, categoryId: batteryCat, stockQuantity: 4 });
      await makeProduct(h.ds, { slug: 'gone', brandId, categoryId: batteryCat, isActive: false });
      const all = await h.http().get('/admin/products?status=all').set(as()).expect(200);
      expect(all.body.meta.total).toBe(2);
      const archived = await h.http().get('/admin/products?status=archived').set(as()).expect(200);
      expect(archived.body.data.map((p: { slug: string }) => p.slug)).toEqual(['gone']);
      const live = await h.http().get('/admin/products?status=active').set(as()).expect(200);
      expect(live.body.data[0].stockQuantity).toBe(4);
    });
  });

  describe('inventory', () => {
    it('adjusts stock and records each movement', async () => {
      const p = await makeProduct(h.ds, { slug: 'stock-me', brandId, categoryId: batteryCat, stockQuantity: 5 });
      const res = await h.http().post(`/admin/products/${p.id}/inventory-adjustments`).set(as()).send({ delta: 10, note: 'Delivery received' }).expect(201);
      expect(res.body.stockQuantity).toBe(15);
      const movements = await h.http().get(`/admin/inventory-movements?productId=${p.id}`).set(as()).expect(200);
      expect(movements.body.meta.total).toBe(1);
    });

    it('refuses an adjustment that would take stock below zero', async () => {
      const p = await makeProduct(h.ds, { slug: 'few', brandId, categoryId: batteryCat, stockQuantity: 5 });
      const res = await h.http().post(`/admin/products/${p.id}/inventory-adjustments`).set(as()).send({ delta: -6 }).expect(409);
      expect(res.body.code).toBe('INSUFFICIENT_STOCK');
      expect(res.body.details).toEqual({ productId: p.id, available: 5, requested: 6 });
    });

    it('refuses to set stock through a product edit', async () => {
      const p = await makeProduct(h.ds, { slug: 'nope', brandId, categoryId: batteryCat });
      await h.http().put(`/admin/products/${p.id}`).set(as()).send({ initialStock: 5 }).expect(400);
    });
  });

  describe('brands and categories', () => {
    it('refuses to delete a manufacturer that still has products', async () => {
      await makeProduct(h.ds, { slug: 'in-use', brandId, categoryId: batteryCat });
      const res = await h.http().delete(`/admin/brands/${brandId}`).set(as()).expect(409);
      expect(res.body.code).toBe('BRAND_IN_USE');
    });

    it('deletes an unused manufacturer', async () => {
      const created = await h.http().post('/admin/brands').set(as()).send({ name: 'Spare Brand' }).expect(201);
      expect(created.body.slug).toBe('spare-brand');
      await h.http().delete(`/admin/brands/${created.body.id}`).set(as()).expect(200);
    });

    it('allows one level of subcategories and refuses deeper nesting', async () => {
      const sub = await h.http().post('/admin/categories').set(as()).send({ name: 'Tall tubular', parentId: batteryCat }).expect(201);
      const deeper = await h.http().post('/admin/categories').set(as()).send({ name: 'Deeper', parentId: sub.body.id }).expect(422);
      expect(deeper.body.code).toBe('CATEGORY_TOO_DEEP');
    });

    it('refuses to delete a category that has subcategories', async () => {
      await h.http().post('/admin/categories').set(as()).send({ name: 'Child', parentId: batteryCat }).expect(201);
      const res = await h.http().delete(`/admin/categories/${batteryCat}`).set(as()).expect(409);
      expect(res.body.code).toBe('CATEGORY_HAS_CHILDREN');
    });
  });

  describe('combo products', () => {
    it('sets the components of a combo, and refuses components on non-combo products', async () => {
      const inverter = await makeProduct(h.ds, { slug: 'sw-1100', brandId, categoryId: inverterCat, kind: 'inverter', technology: null, capacityAh: null, ratingVa: 1100 });
      const batt = await makeProduct(h.ds, { slug: 'tt-150', brandId, categoryId: batteryCat });
      const combo = await makeProduct(h.ds, { slug: 'home-combo', brandId, categoryId: comboCat, kind: 'combo', capacityAh: 150, ratingVa: 1100 });

      const set = await h.http().put(`/admin/products/${combo.id}/components`).set(as()).send({
        items: [
          { componentProductId: inverter.id, quantity: 1 },
          { componentProductId: batt.id, quantity: 1 },
        ],
      }).expect(200);
      expect(set.body.components.map((c: { name: string }) => c.name).sort()).toEqual(['sw-1100', 'tt-150']);

      const plain = await h.http().put(`/admin/products/${batt.id}/components`).set(as()).send({ items: [{ componentProductId: inverter.id, quantity: 1 }] }).expect(422);
      expect(plain.body.code).toBe('NOT_A_COMBO');
    });

    it('refuses a combo that contains itself or another combo', async () => {
      const combo = await makeProduct(h.ds, { slug: 'combo-a', brandId, categoryId: comboCat, kind: 'combo', capacityAh: 150, ratingVa: 1100 });
      const other = await makeProduct(h.ds, { slug: 'combo-b', brandId, categoryId: comboCat, kind: 'combo', capacityAh: 150, ratingVa: 1100 });
      await h.http().put(`/admin/products/${combo.id}/components`).set(as()).send({ items: [{ componentProductId: combo.id, quantity: 1 }] }).expect(422);
      const nested = await h.http().put(`/admin/products/${combo.id}/components`).set(as()).send({ items: [{ componentProductId: other.id, quantity: 1 }] }).expect(422);
      expect(nested.body.code).toBe('NESTED_COMBO');
    });
  });

  describe('product images', () => {
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);

    it('stores a valid image and returns its public URL', async () => {
      const p = await makeProduct(h.ds, { slug: 'pic', brandId, categoryId: batteryCat });
      const res = await h
        .http()
        .post(`/admin/products/${p.id}/images`)
        .set(as())
        .field('alt', 'Front view')
        .attach('image', PNG, { filename: 'front.png', contentType: 'image/png' })
        .expect(201);
      expect(res.body.url).toMatch(/\/uploads\/.+\.png$/);
      expect(res.body.alt).toBe('Front view');
    });

    it('refuses a file whose contents do not match its declared type', async () => {
      const p = await makeProduct(h.ds, { slug: 'fake-pic', brandId, categoryId: batteryCat });
      const res = await h
        .http()
        .post(`/admin/products/${p.id}/images`)
        .set(as())
        .attach('image', Buffer.from('<html>not an image</html>'), { filename: 'fake.png', contentType: 'image/png' })
        .expect(422);
      expect(res.body.code).toBe('UNSUPPORTED_IMAGE');
    });

    it('refuses other file types outright', async () => {
      const p = await makeProduct(h.ds, { slug: 'pdf-pic', brandId, categoryId: batteryCat });
      const res = await h.http().post(`/admin/products/${p.id}/images`).set(as()).attach('image', Buffer.from('%PDF-1.4'), { filename: 'x.pdf', contentType: 'application/pdf' }).expect(400);
      expect(res.body.code).toBe('UNSUPPORTED_IMAGE');
    });
  });

  describe('customers', () => {
    it('lists customers without exposing password data', async () => {
      await registerCustomer(h, 'listed@example.com', 'Listed Person');
      const res = await h.http().get('/admin/customers').set(as()).expect(200);
      expect(res.body.data.map((c: { email: string }) => c.email)).toEqual(['listed@example.com']);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/);
    });

    it('deactivates a customer, which signs them out and blocks sign-in', async () => {
      const customer = await registerCustomer(h, 'banned@example.com');
      await h.http().patch(`/admin/customers/${customer.id}`).set(as()).send({ isActive: false }).expect(200);
      await h.http().get('/auth/me').set('Authorization', `Bearer ${customer.token}`).expect(401);
      await h.http().post('/auth/login').send({ email: 'banned@example.com', password: 'correct-horse-battery' }).expect(422);
    });

    it('will not let an admin deactivate their own account', async () => {
      const me = await h.ds.getRepository('User').findOneByOrFail({ email: 'admin@test.example' });
      const res = await h.http().patch(`/admin/customers/${(me as { id: number }).id}`).set(as()).send({ isActive: false }).expect(422);
      expect(res.body.code).toBe('SELF_DEACTIVATION');
    });
  });

  describe('orders', () => {
    async function placeOrder(qty: number) {
      const product = await makeProduct(h.ds, { slug: 'order-me', brandId, categoryId: batteryCat, listPricePaise: 1_000_000, stockQuantity: 10 });
      const shopper = await registerCustomer(h, 'shopper@example.com');
      const addressId = await addAddress(h, shopper.token, '500001');
      await h.http().put(`/cart/items/${product.id}`).set('Authorization', `Bearer ${shopper.token}`).send({ quantity: qty }).expect(200);
      const placed = await h
        .http()
        .post('/orders')
        .set('Authorization', `Bearer ${shopper.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({ addressId, paymentMethod: 'cod' })
        .expect(201);
      return { product, orderId: placed.body.order.id as number };
    }

    it('lists orders with the customer and filters by status', async () => {
      await placeOrder(2);
      const all = await h.http().get('/admin/orders').set(as()).expect(200);
      expect(all.body.data[0].customer.email).toBe('shopper@example.com');
      const shipped = await h.http().get('/admin/orders?status=shipped').set(as()).expect(200);
      expect(shipped.body.meta.total).toBe(0);
    });

    it('follows the fulfilment path and refuses skipped or backward steps', async () => {
      const { orderId } = await placeOrder(1);
      const skip = await h.http().patch(`/admin/orders/${orderId}`).set(as()).send({ status: 'shipped' }).expect(422);
      expect(skip.body.code).toBe('INVALID_TRANSITION');
      await h.http().patch(`/admin/orders/${orderId}`).set(as()).send({ status: 'confirmed' }).expect(200);
      await h.http().patch(`/admin/orders/${orderId}`).set(as()).send({ status: 'processing' }).expect(200);
      await h.http().patch(`/admin/orders/${orderId}`).set(as()).send({ status: 'shipped' }).expect(200);
      await h.http().patch(`/admin/orders/${orderId}`).set(as()).send({ status: 'delivered' }).expect(200);
      const back = await h.http().patch(`/admin/orders/${orderId}`).set(as()).send({ status: 'placed' }).expect(422);
      expect(back.body.code).toBe('INVALID_TRANSITION');
    });

    it('cancelling returns stock and reverses the sold count, and refunds are only for cancelled orders', async () => {
      const { product, orderId } = await placeOrder(3);
      const refundTooEarly = await h.http().patch(`/admin/orders/${orderId}`).set(as()).send({ paymentStatus: 'refunded' }).expect(422);
      expect(refundTooEarly.body.code).toBe('INVALID_PAYMENT_STATUS');

      const cancelled = await h.http().patch(`/admin/orders/${orderId}`).set(as()).send({ status: 'cancelled' }).expect(200);
      expect(cancelled.body.status).toBe('cancelled');
      expect(cancelled.body.cancelledAt).not.toBeNull();

      const [row] = await (h.ds as DataSource).query(`SELECT stock_quantity, sold_count FROM products WHERE id = $1`, [product.id]);
      expect(row.stock_quantity).toBe(10);
      expect(row.sold_count).toBe(0);
      const movements = await h.http().get(`/admin/inventory-movements?productId=${product.id}`).set(as()).expect(200);
      expect(movements.body.data.map((m: { reason: string }) => m.reason)).toEqual(expect.arrayContaining(['order_cancelled', 'order']));

      await h.http().patch(`/admin/orders/${orderId}`).set(as()).send({ paymentStatus: 'refunded' }).expect(200);
      await h.http().patch(`/admin/orders/${orderId}`).set(as()).send({ status: 'confirmed' }).expect(422);
    });

    it('does not let a customer change order status', async () => {
      const { orderId } = await placeOrder(1);
      const shopper = await registerCustomer(h, 'other-shopper@example.com');
      await h.http().patch(`/admin/orders/${orderId}`).set('Authorization', `Bearer ${shopper.token}`).send({ status: 'cancelled' }).expect(403);
      expect(orderId).toBeGreaterThan(0);
    });
  });

  describe('dashboard', () => {
    it('reports the figures the admin home needs', async () => {
      const p = await makeProduct(h.ds, { slug: 'low', brandId, categoryId: batteryCat, stockQuantity: 2 });
      await setStock(h.ds, p.id, 2);
      const res = await h.http().get('/admin/dashboard').set(as()).expect(200);
      expect(res.body.products).toEqual({ active: 1, archived: 0 });
      expect(res.body.inventory.lowStock).toBe(1);
      expect(res.body.orders.byStatus).toEqual({ placed: 0, confirmed: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 });
      expect(res.body.revenue).toEqual({ total: 0, today: 0 });
    });
  });
});
