import { Check, Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TimestampedEntity } from './base';
import { User } from './user.entity';
import { Product } from './product.entity';

export const ORDER_STATUSES = ['placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];
export const PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded'] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];

/**
 * Orders hold a snapshot of the shipping address and of every line's name,
 * brand and price, so later catalogue edits never change a placed order.
 * All amounts are integer paise.
 */
@Entity('orders')
@Unique('orders_user_idempotency_unique', ['userId', 'idempotencyKey'])
@Check('orders_total_non_negative', '"total_paise" >= 0')
@Index('orders_user_created_idx', ['userId', 'createdAt'])
export class Order extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Index('orders_number_unique', { unique: true })
  @Column({ name: 'order_number', type: 'varchar', length: 32 })
  orderNumber: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 16, default: 'placed' })
  status: OrderStatusValue;

  @Column({ name: 'payment_method', type: 'varchar', length: 16 })
  paymentMethod: 'cod';

  @Column({ name: 'payment_status', type: 'varchar', length: 16, default: 'unpaid' })
  paymentStatus: PaymentStatusValue;

  @Column({ name: 'subtotal_paise', type: 'int' })
  subtotalPaise: number;

  @Column({ name: 'shipping_paise', type: 'int' })
  shippingPaise: number;

  @Column({ name: 'tax_paise', type: 'int' })
  taxPaise: number;

  @Column({ name: 'total_paise', type: 'int' })
  totalPaise: number;

  /** Snapshot of the address used at checkout. */
  @Column({ name: 'shipping_address', type: 'jsonb' })
  shippingAddress: {
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    pincode: string;
  };

  /** Client-generated key that makes a retried checkout return the same order. */
  @Column({ name: 'idempotency_key', type: 'varchar', length: 100 })
  idempotencyKey: string;

  /** Hash of the checkout request, so a reused key with different input is rejected. */
  @Column({ name: 'request_hash', type: 'varchar', length: 64 })
  requestHash: string;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @OneToMany(() => OrderItem, (i) => i.order)
  items: OrderItem[];
}

@Entity('order_items')
@Index('order_items_order_idx', ['orderId'])
export class OrderItem extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @ManyToOne(() => Order, (o) => o.items, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id', type: 'int' })
  orderId: number;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id', type: 'int' })
  productId: number;

  // Snapshots taken at checkout.
  @Column({ name: 'product_name', type: 'varchar', length: 200 })
  productName: string;

  @Column({ name: 'brand_name', type: 'varchar', length: 120 })
  brandName: string;

  @Column({ name: 'model_number', type: 'varchar', length: 80 })
  modelNumber: string;

  @Column({ name: 'unit_price_paise', type: 'int' })
  unitPricePaise: number;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ name: 'line_total_paise', type: 'int' })
  lineTotalPaise: number;
}
