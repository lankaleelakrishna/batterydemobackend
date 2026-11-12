import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AppError } from '../../common/errors';
import { paged } from '../../common/pagination';
import { toRupees } from '../../common/money';
import { AuthUser } from '../../common/auth/auth.types';
import { Order, OrderItem, OrderStatusValue, PaymentStatusValue, PAYMENT_STATUSES, ORDER_STATUSES } from '../../database/entities/order.entity';
import { User } from '../../database/entities/user.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductAdminService } from '../products/product-admin.service';
import { toOrderView } from '../orders/order.view';
import { LOW_STOCK_THRESHOLD } from '../products/catalogue-rules';

/** Order status state machine. Anything not listed here is refused. */
export const ALLOWED_TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: OrderStatusValue, to: OrderStatusValue): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly productAdmin: ProductAdminService,
    private readonly dataSource: DataSource,
  ) {}

  async dashboard() {
    const [counts] = await this.dataSource.query(`
      SELECT
        (SELECT COUNT(*)::int FROM products WHERE is_active = true) AS active_products,
        (SELECT COUNT(*)::int FROM products WHERE is_active = false) AS archived_products,
        (SELECT COUNT(*)::int FROM products WHERE is_active = true AND stock_quantity BETWEEN 1 AND $1) AS low_stock,
        (SELECT COUNT(*)::int FROM products WHERE is_active = true AND stock_quantity = 0) AS out_of_stock,
        (SELECT COUNT(*)::int FROM users WHERE role = 'customer') AS customers,
        (SELECT COUNT(*)::int FROM reviews WHERE status = 'pending') AS pending_reviews,
        (SELECT COUNT(*)::int FROM newsletter_subscribers WHERE status = 'subscribed') AS subscribers,
        (SELECT COUNT(*)::int FROM orders) AS orders_total,
        (SELECT COUNT(*)::int FROM orders WHERE created_at >= date_trunc('day', now())) AS orders_today,
        (SELECT COALESCE(SUM(total_paise), 0)::bigint FROM orders WHERE status <> 'cancelled') AS revenue_paise,
        (SELECT COALESCE(SUM(total_paise), 0)::bigint FROM orders WHERE status <> 'cancelled' AND created_at >= date_trunc('day', now())) AS revenue_today_paise
    `, [LOW_STOCK_THRESHOLD]);

    const byStatus: { status: string; count: number }[] = await this.dataSource.query(
      `SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status`,
    );
    const recent = await this.orders.find({ relations: { user: true }, order: { id: 'DESC' }, take: 5 });
    const recentItems = recent.length ? await this.orderItems.find({ where: { orderId: In(recent.map((r) => r.id)) } }) : [];

    return {
      products: { active: counts.active_products, archived: counts.archived_products },
      inventory: { lowStock: counts.low_stock, outOfStock: counts.out_of_stock, lowStockThreshold: LOW_STOCK_THRESHOLD },
      customers: counts.customers,
      orders: {
        total: counts.orders_total,
        today: counts.orders_today,
        byStatus: Object.fromEntries(ORDER_STATUSES.map((s) => [s, byStatus.find((b) => b.status === s)?.count ?? 0])),
      },
      revenue: { total: toRupees(Number(counts.revenue_paise)), today: toRupees(Number(counts.revenue_today_paise)) },
      pendingReviews: counts.pending_reviews,
      subscribers: counts.subscribers,
      recentOrders: recent.map((o) => ({
        ...toOrderView(o, recentItems),
        customer: { id: o.user.id, email: o.user.email, fullName: o.user.fullName },
      })),
    };
  }

  async listCustomers(search: string | undefined, page: number, limit: number) {
    const qb = this.users.createQueryBuilder('u').where("u.role = 'customer'").orderBy('u.id', 'DESC');
    if (search) {
      const term = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      qb.andWhere('(u.email ILIKE :term OR u.full_name ILIKE :term)', { term });
    }
    const [rows, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    const counts: { user_id: number; cnt: number }[] = rows.length
      ? await this.dataSource.query(`SELECT user_id, COUNT(*)::int AS cnt FROM orders WHERE user_id = ANY($1) GROUP BY user_id`, [rows.map((r) => r.id)])
      : [];
    const orderCount = new Map(counts.map((c) => [Number(c.user_id), Number(c.cnt)]));
    return paged(
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        phone: u.phone,
        isActive: u.isActive,
        orderCount: orderCount.get(u.id) ?? 0,
        createdAt: u.createdAt,
      })),
      page,
      limit,
      total,
    );
  }

  /**
   * Deactivating a customer revokes their sessions immediately (token version bump).
   * Admins cannot deactivate their own account, so the store cannot lock itself out.
   */
  async setCustomerActive(actor: AuthUser, id: number, isActive: boolean) {
    if (id === actor.id && !isActive) {
      throw AppError.unprocessable('SELF_DEACTIVATION', 'You cannot deactivate your own account.');
    }
    const user = await this.users.findOne({ where: { id, role: 'customer' } });
    if (!user) throw AppError.notFound('Customer not found.', 'CUSTOMER_NOT_FOUND');
    user.isActive = isActive;
    if (!isActive) user.tokenVersion += 1;
    await this.users.save(user);
    return { id: user.id, isActive: user.isActive };
  }

  async listOrders(opts: { status?: OrderStatusValue; from?: string; to?: string; page: number; limit: number }) {
    const qb = this.orders.createQueryBuilder('o').innerJoinAndSelect('o.user', 'u').orderBy('o.id', 'DESC');
    if (opts.status) qb.andWhere('o.status = :status', { status: opts.status });
    if (opts.from) qb.andWhere('o.created_at >= :from', { from: new Date(`${opts.from}T00:00:00Z`) });
    if (opts.to) qb.andWhere('o.created_at < :to', { to: new Date(new Date(`${opts.to}T00:00:00Z`).getTime() + 86_400_000) });
    const [rows, total] = await qb.skip((opts.page - 1) * opts.limit).take(opts.limit).getManyAndCount();
    const items = rows.length ? await this.orderItems.find({ where: { orderId: In(rows.map((r) => r.id)) } }) : [];
    return paged(
      rows.map((o) => ({ ...toOrderView(o, items), customer: { id: o.user.id, email: o.user.email, fullName: o.user.fullName, phone: o.user.phone } })),
      opts.page,
      opts.limit,
      total,
    );
  }

  async orderDetail(id: number) {
    const order = await this.orders.findOne({ where: { id }, relations: { user: true } });
    if (!order) throw AppError.notFound('Order not found.', 'ORDER_NOT_FOUND');
    const items = await this.orderItems.find({ where: { orderId: id } });
    return { ...toOrderView(order, items), customer: { id: order.user.id, email: order.user.email, fullName: order.user.fullName, phone: order.user.phone } };
  }

  /**
   * Status changes follow ALLOWED_TRANSITIONS. Cancelling returns the stock
   * to inventory and reverses the sold count, in the same transaction.
   */
  async updateOrder(actor: AuthUser, id: number, dto: { status?: OrderStatusValue; paymentStatus?: PaymentStatusValue }) {
    await this.dataSource.transaction(async (m) => {
      const order = await m.getRepository(Order).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!order) throw AppError.notFound('Order not found.', 'ORDER_NOT_FOUND');

      if (dto.status !== undefined && dto.status !== order.status) {
        if (!canTransition(order.status, dto.status)) {
          throw AppError.unprocessable('INVALID_TRANSITION', `An order cannot move from ${order.status} to ${dto.status}.`, {
            from: order.status,
            to: dto.status,
          });
        }
        if (dto.status === 'cancelled') {
          const items = await m.getRepository(OrderItem).find({ where: { orderId: id } });
          for (const item of items) {
            await this.productAdmin.applyStockDelta(m, item.productId, item.quantity, 'order_cancelled', actor.id, `Cancelled ${order.orderNumber}`, id);
            await m.getRepository(Product).decrement({ id: item.productId }, 'soldCount', item.quantity);
          }
          order.cancelledAt = new Date();
        }
        order.status = dto.status;
      }

      if (dto.paymentStatus !== undefined) {
        if (!(PAYMENT_STATUSES as readonly string[]).includes(dto.paymentStatus)) {
          throw AppError.badRequest('VALIDATION_FAILED', 'Unknown payment status.');
        }
        // A refund only makes sense for a cancelled order.
        if (dto.paymentStatus === 'refunded' && order.status !== 'cancelled') {
          throw AppError.unprocessable('INVALID_PAYMENT_STATUS', 'Only cancelled orders can be marked refunded.');
        }
        order.paymentStatus = dto.paymentStatus;
      }

      await m.getRepository(Order).save(order);
    });
    return this.orderDetail(id);
  }
}
