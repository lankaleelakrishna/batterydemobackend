import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { TimestampedEntity, numericToNumber } from './base';
import { Brand } from './brand.entity';
import { Category } from './category.entity';
import { ProductImage } from './product-related.entity';

export type ProductKindValue = 'battery' | 'inverter' | 'combo';
export type BatteryTechnologyValue = 'tall-tubular' | 'short-tubular' | 'flat-plate' | 'lithium-ion' | 'smf';

/**
 * All money columns are integer paise. `sale_price_paise` applies only inside
 * [sale_starts_at, sale_ends_at). `stock_quantity` never goes below zero.
 */
@Entity('products')
@Check('products_price_positive', '"list_price_paise" > 0')
@Check('products_sale_below_list', '"sale_price_paise" IS NULL OR ("sale_price_paise" > 0 AND "sale_price_paise" < "list_price_paise")')
@Check('products_stock_non_negative', '"stock_quantity" >= 0')
@Check('products_kind_valid', `"kind" IN ('battery','inverter','combo')`)
export class Product extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Index('products_slug_unique', { unique: true })
  @Column({ type: 'varchar', length: 180 })
  slug: string;

  @Index('products_sku_unique', { unique: true, where: '"sku" IS NOT NULL' })
  @Column({ type: 'varchar', length: 64, nullable: true })
  sku: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind: ProductKindValue;

  @ManyToOne(() => Brand, { onDelete: 'RESTRICT', nullable: false, eager: false })
  @JoinColumn({ name: 'brand_id' })
  brand: Brand;

  @Index('products_brand_idx')
  @Column({ name: 'brand_id', type: 'int' })
  brandId: number;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Index('products_category_idx')
  @Column({ name: 'category_id', type: 'int' })
  categoryId: number;

  @Column({ name: 'model_number', type: 'varchar', length: 80 })
  modelNumber: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 240, nullable: true })
  tagline: string | null;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 24, nullable: true })
  technology: BatteryTechnologyValue | null;

  @Column({ name: 'capacity_ah', type: 'int', nullable: true })
  capacityAh: number | null;

  @Column({ name: 'rating_va', type: 'int', nullable: true })
  ratingVa: number | null;

  @Column({ name: 'warranty_months', type: 'int', nullable: true })
  warrantyMonths: number | null;

  @Column({ name: 'length_mm', type: 'int', nullable: true })
  lengthMm: number | null;

  @Column({ name: 'width_mm', type: 'int', nullable: true })
  widthMm: number | null;

  @Column({ name: 'height_mm', type: 'int', nullable: true })
  heightMm: number | null;

  @Column({ name: 'weight_kg', type: 'numeric', precision: 7, scale: 2, nullable: true, transformer: numericToNumber })
  weightKg: number | null;

  @Column({ name: 'list_price_paise', type: 'int' })
  listPricePaise: number;

  @Column({ name: 'sale_price_paise', type: 'int', nullable: true })
  salePricePaise: number | null;

  @Column({ name: 'sale_starts_at', type: 'timestamptz', nullable: true })
  saleStartsAt: Date | null;

  @Column({ name: 'sale_ends_at', type: 'timestamptz', nullable: true })
  saleEndsAt: Date | null;

  @Column({ name: 'stock_quantity', type: 'int', default: 0 })
  stockQuantity: number;

  /** Shown as "Pre-order" when out of stock. Pre-orders cannot be checked out yet. */
  @Column({ name: 'accepts_preorders', type: 'boolean', default: false })
  acceptsPreorders: boolean;

  @Column({ name: 'sold_count', type: 'int', default: 0 })
  soldCount: number;

  @Column({ name: 'is_featured', type: 'boolean', default: false })
  isFeatured: boolean;

  @Column({ name: 'is_best_seller', type: 'boolean', default: false })
  isBestSeller: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** Optimistic locking for admin edits and stock changes. */
  @VersionColumn({ type: 'int', default: 1 })
  version: number;

  @OneToMany(() => ProductImage, (i) => i.product)
  images: ProductImage[];
}
