import { Brand } from '../../database/entities/brand.entity';
import { Category } from '../../database/entities/category.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductImage, ProductSpecRow } from '../../database/entities/product-related.entity';
import { compareAtPaise, effectivePricePaise } from '../../common/pricing';
import { toRupees } from '../../common/money';
import { stockStatus, StockStatus } from './catalogue-rules';

/**
 * Public product shape. Field names and types follow the frontend's
 * `Product` type in volten/src/types/product.ts exactly. Money is in rupees.
 */
export interface MoneyView {
  amount: number;
  currency: 'INR';
}

export interface ProductView {
  id: string;
  slug: string;
  kind: 'battery' | 'inverter' | 'combo';
  brand: string;
  modelNumber: string;
  name: string;
  tagline?: string;
  categorySlug: string;
  images: { url: string; alt: string; width?: number; height?: number }[];
  price: { current: MoneyView; compareAt?: MoneyView };
  capacityAh?: number;
  ratingVA?: number;
  technology?: string;
  warrantyMonths?: number;
  dimensionsMm?: { length: number; width: number; height: number };
  weightKg?: number;
  stock: StockStatus;
  rating?: { average: number; count: number };
  badges: string[];
  specs: { label: string; value: string }[];
}

export interface RatingSummary {
  average: number;
  count: number;
}

export interface ProductContext {
  images: ProductImage[];
  specs: ProductSpecRow[];
  rating?: RatingSummary;
  now?: Date;
}

export type ProductWithRelations = Product & { brand: Brand; category: Category };

export function toProductView(p: ProductWithRelations, ctx: ProductContext): ProductView {
  const now = ctx.now ?? new Date();
  const current = effectivePricePaise(p, now);
  const compareAt = compareAtPaise(p, now);

  const view: ProductView = {
    id: String(p.id),
    slug: p.slug,
    kind: p.kind,
    brand: p.brand.name,
    modelNumber: p.modelNumber,
    name: p.name,
    categorySlug: p.category.slug,
    images: ctx.images
      .filter((i) => i.productId === p.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((i) => ({
        url: i.url,
        alt: i.alt || p.name,
        ...(i.width ? { width: i.width } : {}),
        ...(i.height ? { height: i.height } : {}),
      })),
    price: {
      current: { amount: toRupees(current), currency: 'INR' },
      ...(compareAt !== null ? { compareAt: { amount: toRupees(compareAt), currency: 'INR' } } : {}),
    },
    stock: stockStatus(p.stockQuantity, p.acceptsPreorders),
    badges: [...(p.isFeatured ? ['featured'] : []), ...(p.isBestSeller ? ['bestseller'] : [])],
    specs: ctx.specs
      .filter((s) => s.productId === p.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
      .map((s) => ({ label: s.label, value: s.value })),
  };

  if (p.tagline) view.tagline = p.tagline;
  if (p.capacityAh !== null) view.capacityAh = p.capacityAh;
  if (p.ratingVa !== null) view.ratingVA = p.ratingVa;
  if (p.technology) view.technology = p.technology;
  if (p.warrantyMonths !== null) view.warrantyMonths = p.warrantyMonths;
  if (p.lengthMm !== null && p.widthMm !== null && p.heightMm !== null) {
    view.dimensionsMm = { length: p.lengthMm, width: p.widthMm, height: p.heightMm };
  }
  if (p.weightKg !== null) view.weightKg = p.weightKg;
  if (ctx.rating && ctx.rating.count > 0) view.rating = ctx.rating;
  return view;
}
