/**
 * Development demo seed. Run with:  npm run seed:demo
 *
 * Safety rules, all enforced here:
 * - Refuses to run when NODE_ENV=production.
 * - Refuses to run unless the database name contains "volten".
 * - Demo passwords must come from DEMO_ADMIN_PASSWORD and DEMO_CUSTOMER_PASSWORD.
 * - Idempotent: existing brands, categories, products, users and testimonials are left alone.
 */
import '../../config/load-env';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { loadDatabaseEnv } from '../../config/env';
import { buildTypeOrmOptions } from '../database.options';
import { Address } from '../entities/address.entity';
import { Brand } from '../entities/brand.entity';
import { Category } from '../entities/category.entity';
import { Testimonial, InventoryMovement } from '../entities/commerce.entity';
import { Product } from '../entities/product.entity';
import { ProductComboItem } from '../entities/product-related.entity';
import { User } from '../entities/user.entity';
import { slugify } from '../../common/text';
import { decideSeedTarget } from './seed-target';
import {
  DEMO_BRANDS,
  DEMO_CATEGORIES,
  DEMO_COMBO_ITEMS,
  DEMO_PRODUCTS,
  DEMO_STOCK_QUANTITY,
  DEMO_TESTIMONIALS,
} from './demo-catalogue.data';

const DEMO_ADMIN_EMAIL = 'admin.demo@volten.example';
const DEMO_CUSTOMER_EMAIL = 'customer.demo@volten.example';

interface Summary {
  brands: number;
  categories: number;
  products: number;
  users: number;
  testimonials: number;
  skipped: string[];
}

async function seed(m: EntityManager, passwords: { admin: string; customer: string }): Promise<Summary> {
  const summary: Summary = { brands: 0, categories: 0, products: 0, users: 0, testimonials: 0, skipped: [] };

  // Users
  const users = m.getRepository(User);
  const admin = await users.findOne({ where: { email: DEMO_ADMIN_EMAIL } });
  if (!admin) {
    await users.save(
      users.create({
        email: DEMO_ADMIN_EMAIL,
        fullName: 'Demo Admin',
        phone: null,
        passwordHash: await bcrypt.hash(passwords.admin, 12),
        role: 'admin',
        isActive: true,
        tokenVersion: 0,
      }),
    );
    summary.users += 1;
  }
  let customer = await users.findOne({ where: { email: DEMO_CUSTOMER_EMAIL } });
  if (!customer) {
    customer = await users.save(
      users.create({
        email: DEMO_CUSTOMER_EMAIL,
        fullName: 'Demo Customer',
        phone: '+91 00000 00000',
        passwordHash: await bcrypt.hash(passwords.customer, 12),
        role: 'customer',
        isActive: true,
        tokenVersion: 0,
      }),
    );
    summary.users += 1;
    await m.getRepository(Address).save(
      m.getRepository(Address).create({
        userId: customer.id,
        fullName: 'Demo Customer',
        phone: '+91 00000 00000',
        line1: 'Demo address line 1',
        line2: null,
        city: 'Demo City',
        state: 'Demo State',
        pincode: '500001',
        isDefault: true,
      }),
    );
  }

  // Brands
  const brandIds = new Map<string, number>();
  for (const b of DEMO_BRANDS) {
    const slug = slugify(b.name);
    let row = await m.getRepository(Brand).findOne({ where: { slug } });
    if (!row) {
      row = await m.getRepository(Brand).save(m.getRepository(Brand).create({ name: b.name, slug, description: b.description, isActive: true }));
      summary.brands += 1;
    }
    brandIds.set(b.name, row.id);
  }

  // Categories: top-level first, then subcategories.
  const categoryIds = new Map<string, number>();
  const orderedCategories = [...DEMO_CATEGORIES.filter((c) => !c.parentSlug), ...DEMO_CATEGORIES.filter((c) => c.parentSlug)];
  for (const c of orderedCategories) {
    let row = await m.getRepository(Category).findOne({ where: { slug: c.slug } });
    if (!row) {
      const parentId = c.parentSlug ? (categoryIds.get(c.parentSlug) ?? null) : null;
      row = await m.getRepository(Category).save(
        m.getRepository(Category).create({
          slug: c.slug,
          name: c.name,
          description: c.description,
          visual: c.visual,
          parentId,
          sortOrder: c.sortOrder,
          isActive: true,
        }),
      );
      summary.categories += 1;
    }
    categoryIds.set(c.slug, row.id);
  }

  // Products (with specs fields, stock movement and images none)
  const productIds = new Map<string, number>();
  for (const p of DEMO_PRODUCTS) {
    const existing = await m.getRepository(Product).findOne({ where: { slug: p.slug } });
    if (existing) {
      productIds.set(p.slug, existing.id);
      summary.skipped.push(p.slug);
      continue;
    }
    const qty = DEMO_STOCK_QUANTITY[p.stock];
    const hasSale = p.compareAtRupees !== undefined;
    const product = await m.getRepository(Product).save(
      m.getRepository(Product).create({
        slug: p.slug,
        sku: null,
        kind: p.kind,
        brandId: brandIds.get(p.brand)!,
        categoryId: categoryIds.get(p.category)!,
        modelNumber: p.modelNumber,
        name: p.name,
        tagline: p.tagline ?? null,
        description: '',
        technology: (p.technology ?? null) as Product['technology'],
        capacityAh: p.capacityAh ?? null,
        ratingVa: p.ratingVa ?? null,
        warrantyMonths: p.warrantyMonths ?? null,
        lengthMm: p.dimensionsMm?.length ?? null,
        widthMm: p.dimensionsMm?.width ?? null,
        heightMm: p.dimensionsMm?.height ?? null,
        weightKg: p.weightKg ?? null,
        listPricePaise: (hasSale ? p.compareAtRupees! : p.priceRupees) * 100,
        salePricePaise: hasSale ? p.priceRupees * 100 : null,
        saleStartsAt: null,
        saleEndsAt: null,
        stockQuantity: 0,
        acceptsPreorders: p.stock === 'preorder',
        soldCount: 0,
        isFeatured: p.featured ?? false,
        isBestSeller: p.bestSeller ?? false,
        isActive: true,
      }),
    );
    if (qty > 0) {
      await m.getRepository(Product).update({ id: product.id }, { stockQuantity: qty });
      await m.getRepository(InventoryMovement).save(
        m.getRepository(InventoryMovement).create({ productId: product.id, delta: qty, reason: 'adjustment', orderId: null, actorUserId: null, note: 'Demo seed stock' }),
      );
    }
    productIds.set(p.slug, product.id);
    summary.products += 1;
  }

  // Combo components
  for (const link of DEMO_COMBO_ITEMS) {
    const comboId = productIds.get(link.combo)!;
    const componentId = productIds.get(link.component)!;
    const exists = await m.getRepository(ProductComboItem).findOne({ where: { comboProductId: comboId, componentProductId: componentId } });
    if (!exists) {
      await m.getRepository(ProductComboItem).save(
        m.getRepository(ProductComboItem).create({ comboProductId: comboId, componentProductId: componentId, quantity: link.quantity, sortOrder: 0 }),
      );
    }
  }

  // Testimonials (published, labelled as sample content)
  for (const t of DEMO_TESTIMONIALS) {
    const exists = await m.getRepository(Testimonial).findOne({ where: { author: t.author, body: t.body } });
    if (!exists) {
      await m.getRepository(Testimonial).save(
        m.getRepository(Testimonial).create({
          author: t.author,
          location: t.location,
          rating: t.rating,
          body: t.body,
          productId: productIds.get(t.productSlug) ?? null,
          isPublished: true,
          sortOrder: summary.testimonials,
        }),
      );
      summary.testimonials += 1;
    }
  }

  return summary;
}

async function main() {
  const env = process.env;
  if ((env.NODE_ENV ?? 'development') === 'production') {
    throw new Error('Demo seed refuses to run when NODE_ENV=production.');
  }
  const db = loadDatabaseEnv();
  const decision = decideSeedTarget(db, env);
  if (!decision.allowed) {
    throw new Error(`Demo seed refused: ${decision.reason}.`);
  }
  console.log(`Seed target accepted: ${decision.reason}.`);
  const adminPw = env.DEMO_ADMIN_PASSWORD;
  const customerPw = env.DEMO_CUSTOMER_PASSWORD;
  if (!adminPw || !customerPw) {
    throw new Error('Set DEMO_ADMIN_PASSWORD and DEMO_CUSTOMER_PASSWORD before seeding.');
  }

  const ds = new DataSource(buildTypeOrmOptions(db));
  await ds.initialize();
  try {
    const summary = await ds.transaction((m) => seed(m, { admin: adminPw, customer: customerPw }));
    console.log(
      `Demo seed complete on "${db.database}": ${summary.brands} brands, ${summary.categories} categories, ${summary.products} products, ${summary.users} users, ${summary.testimonials} testimonials added. Existing products left alone: ${summary.skipped.length}.`,
    );
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
