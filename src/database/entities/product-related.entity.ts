import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Product } from './product.entity';
import { TimestampedEntity } from './base';

@Entity('product_images')
@Index('product_images_product_idx', ['productId'])
export class ProductImage extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @ManyToOne(() => Product, (p) => p.images, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id', type: 'int' })
  productId: number;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 200, default: '' })
  alt: string;

  @Column({ type: 'int', nullable: true })
  width: number | null;

  @Column({ type: 'int', nullable: true })
  height: number | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}

@Entity('product_specs')
@Unique('product_specs_label_unique', ['productId', 'label'])
export class ProductSpecRow extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'product_id', type: 'int' })
  productId: number;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'varchar', length: 300 })
  value: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}

/** A combo is a product made of other products (an inverter plus a battery). */
@Entity('product_combo_items')
@Unique('combo_items_unique', ['comboProductId', 'componentProductId'])
@Check('combo_items_not_self', '"combo_product_id" <> "component_product_id"')
@Check('combo_items_qty_positive', '"quantity" > 0')
export class ProductComboItem extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ name: 'combo_product_id', type: 'int' })
  comboProductId: number;

  @Column({ name: 'component_product_id', type: 'int' })
  componentProductId: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
