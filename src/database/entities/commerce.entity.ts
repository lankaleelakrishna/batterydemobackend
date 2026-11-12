import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TimestampedEntity } from './base';
import { Product } from './product.entity';
import { User } from './user.entity';

@Entity('reviews')
@Unique('reviews_user_product_unique', ['userId', 'productId'])
@Check('reviews_rating_range', '"rating" BETWEEN 1 AND 5')
@Index('reviews_product_status_idx', ['productId', 'status'])
export class Review extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id', type: 'int' })
  productId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'varchar', length: 120, default: '' })
  title: string;

  @Column({ type: 'text', default: '' })
  body: string;

  /** New reviews wait for admin approval before they are shown. */
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: 'pending' | 'approved' | 'rejected';
}

@Entity('testimonials')
export class Testimonial extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 120 })
  author: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  location: string | null;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text' })
  body: string;

  @ManyToOne(() => Product, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  @Column({ name: 'product_id', type: 'int', nullable: true })
  productId: number | null;

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}

@Entity('newsletter_subscribers')
export class NewsletterSubscriber extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Index('newsletter_email_unique', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 16, default: 'subscribed' })
  status: 'subscribed' | 'unsubscribed';
}

@Entity('wishlist_items')
@Unique('wishlist_user_product_unique', ['userId', 'productId'])
export class WishlistItem extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id', type: 'int' })
  productId: number;
}

@Entity('cart_items')
@Unique('cart_user_product_unique', ['userId', 'productId'])
@Check('cart_quantity_range', '"quantity" BETWEEN 1 AND 10')
export class CartItem extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => Product, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id', type: 'int' })
  productId: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;
}

@Entity('inventory_movements')
@Index('inventory_product_idx', ['productId'])
export class InventoryMovement extends TimestampedEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'product_id', type: 'int' })
  productId: number;

  /** Positive for stock in, negative for stock out. */
  @Column({ type: 'int' })
  delta: number;

  @Column({ type: 'varchar', length: 24 })
  reason: 'adjustment' | 'order' | 'order_cancelled';

  @Column({ name: 'order_id', type: 'int', nullable: true })
  orderId: number | null;

  @Column({ name: 'actor_user_id', type: 'int', nullable: true })
  actorUserId: number | null;

  @Column({ type: 'varchar', length: 300, default: '' })
  note: string;
}
