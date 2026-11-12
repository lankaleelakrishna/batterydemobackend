import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { loadAppEnv } from '../../src/config/env';
import { Brand } from '../../src/database/entities/brand.entity';
import { Category } from '../../src/database/entities/category.entity';
import { Product } from '../../src/database/entities/product.entity';
import { User } from '../../src/database/entities/user.entity';

export const PASSWORD = 'correct-horse-battery';

export interface Harness {
  app: INestApplication;
  ds: DataSource;
  http: () => ReturnType<typeof request>;
}

/** Boots the real application against the isolated test database. Refuses any other database. */
export async function startHarness(): Promise<Harness> {
  const env = loadAppEnv();
  if (!/test/i.test(env.database.database) || /dev/i.test(env.database.database)) {
    throw new Error(`End-to-end tests only run against a test database (got "${env.database.database}").`);
  }
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, env);
  await app.init();
  const ds = app.get(DataSource);
  await ds.runMigrations();
  return { app, ds, http: () => request(app.getHttpServer()) };
}

export async function resetDatabase(ds: DataSource) {
  await ds.query(`
    TRUNCATE TABLE users, addresses, brands, categories, products, product_images, product_specs,
      product_combo_items, reviews, testimonials, newsletter_subscribers, wishlist_items, cart_items,
      inventory_movements, orders, order_items
    RESTART IDENTITY CASCADE`);
}

export async function makeBrand(ds: DataSource, name: string): Promise<Brand> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return ds.getRepository(Brand).save(ds.getRepository(Brand).create({ name, slug, description: '', isActive: true }));
}

export async function makeCategory(ds: DataSource, slug: string, parentId: number | null = null): Promise<Category> {
  return ds.getRepository(Category).save(
    ds.getRepository(Category).create({ name: slug, slug, description: '', visual: 'battery', parentId, sortOrder: 0, isActive: true }),
  );
}

export async function makeProduct(ds: DataSource, o: Partial<Product> & { slug: string; brandId: number; categoryId: number }): Promise<Product> {
  const repo = ds.getRepository(Product);
  const row = repo.create({
    kind: 'battery',
    modelNumber: o.slug.toUpperCase(),
    name: o.slug,
    tagline: null,
    description: '',
    technology: 'tall-tubular',
    capacityAh: 150,
    ratingVa: null,
    warrantyMonths: 60,
    lengthMm: 500,
    widthMm: 190,
    heightMm: 260,
    weightKg: 40,
    listPricePaise: 1_800_000,
    salePricePaise: null,
    saleStartsAt: null,
    saleEndsAt: null,
    stockQuantity: 40,
    acceptsPreorders: false,
    soldCount: 0,
    isFeatured: false,
    isBestSeller: false,
    isActive: true,
    sku: null,
    ...o,
  } as Product);
  return repo.save(row);
}

/** Sets a product's stock with a real inventory movement row, the same way the admin API does. */
export async function setStock(ds: DataSource, productId: number, quantity: number) {
  await ds.query(`UPDATE products SET stock_quantity = $2 WHERE id = $1`, [productId, quantity]);
}

export async function makeUser(ds: DataSource, o: { email: string; fullName: string; role?: 'customer' | 'admin'; isActive?: boolean }) {
  const repo = ds.getRepository(User);
  return repo.save(
    repo.create({
      email: o.email,
      fullName: o.fullName,
      phone: null,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      role: o.role ?? 'customer',
      isActive: o.isActive ?? true,
      tokenVersion: 0,
    }),
  );
}

export async function signIn(h: Harness, email: string): Promise<string> {
  const res = await h.http().post('/auth/login').send({ email, password: PASSWORD }).expect(200);
  return res.body.token as string;
}

/** Creates a customer through the public API and returns a session token. */
export async function registerCustomer(h: Harness, email: string, fullName = 'Test Customer') {
  const res = await h.http().post('/auth/register').send({ email, fullName, password: PASSWORD }).expect(201);
  return { token: res.body.token as string, id: res.body.user.id as number };
}

export async function makeAdminSession(h: Harness, email = 'admin@test.example') {
  await makeUser(h.ds, { email, fullName: 'Test Admin', role: 'admin' });
  return signIn(h, email);
}

export async function addAddress(h: Harness, token: string, pincode = '500001') {
  const res = await h
    .http()
    .post('/me/addresses')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullName: 'Test Customer', phone: '+91 98765 43210', line1: '12 Test Street', city: 'Hyderabad', state: 'Telangana', pincode })
    .expect(201);
  return res.body.id as number;
}
