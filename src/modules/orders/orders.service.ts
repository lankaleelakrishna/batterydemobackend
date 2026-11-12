import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AppEnv } from '../../config/env';
import { AppError } from '../../common/errors';
import { paged } from '../../common/pagination';
import { effectivePricePaise } from '../../common/pricing';
import { toRupees } from '../../common/money';
import { AuthUser } from '../../common/auth/auth.types';
import { Address } from '../../database/entities/address.entity';
import { Brand } from '../../database/entities/brand.entity';
import { CartItem } from '../../database/entities/commerce.entity';
import { Product } from '../../database/entities/product.entity';
import { Order, OrderItem } from '../../database/entities/order.entity';
import { isUniqueViolation } from '../auth/auth.service';
import { CartService } from '../cart/cart.service';
import { ProductAdminService } from '../products/product-admin.service';
import { assertOrderAllowed, computeTotals, ConfiguredRules, PaymentMethod, requireConfiguredRules, Totals } from './checkout-policy';
import { toOrderView } from './order.view';

export interface PlaceOrderInput {
  addressId: number;
  paymentMethod: PaymentMethod;
}

interface PreparedLine {
  productId: number;
  productName: string;
  brandName: string;
  modelNumber: string;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
}

interface Prepared {
  address: Address;
  lines: PreparedLine[];
  rules: ConfiguredRules;
  totals: Totals;
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
    @InjectRepository(CartItem) private readonly cart: Repository<CartItem>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly productAdmin: ProductAdminService,
    private readonly cartService: CartService,
  ) {}

  /**
   * Everything the customer would be charged, computed on the server from
   * current prices. Nothing is written. Used by the review step of checkout.
   */
  async quote(user: AuthUser, input: PlaceOrderInput) {
    const prepared = await this.prepare(this.dataSource.manager, user.id, input, new Date(), false);
    return {
      paymentMethod: input.paymentMethod,
      items: prepared.lines.map((l) => ({
        productId: String(l.productId),
        productName: l.productName,
        quantity: l.quantity,
        unitPrice: toRupees(l.unitPricePaise),
        lineTotal: toRupees(l.lineTotalPaise),
      })),
      subtotal: toRupees(prepared.totals.subtotalPaise),
      shipping: toRupees(prepared.totals.shippingPaise),
      tax: toRupees(prepared.totals.taxPaise),
      total: toRupees(prepared.totals.totalPaise),
      gstMode: prepared.rules.gstMode,
    };
  }

  /**
   * Places an order from the customer's server-side cart. The client sends
   * only an address id and a payment method, never prices, quantities or totals.
   * Requires an Idempotency-Key header so a retried request cannot create a second order.
   */
  async place(user: AuthUser, input: PlaceOrderInput, idempotencyKey: string | undefined) {
    if (!idempotencyKey || !KEY_PATTERN.test(idempotencyKey)) {
      throw AppError.badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header (8–100 letters, digits, "-" or "_").');
    }
    const requestHash = hashRequest(input);

    const existing = await this.orders.findOne({ where: { userId: user.id, idempotencyKey } });
    if (existing) return this.replay(user.id, existing, requestHash);

    try {
      const outcome = await this.dataSource.transaction(async (m): Promise<{ orderId: number; replayed: boolean }> => {
        // Checked again inside the transaction: a concurrent identical request may have committed while this one waited.
        const committed = await m.getRepository(Order).findOne({ where: { userId: user.id, idempotencyKey } });
        if (committed) {
          if (committed.requestHash !== requestHash) {
            throw AppError.unprocessable('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different order.');
          }
          return { orderId: committed.id, replayed: true };
        }

        const prepared = await this.prepare(m, user.id, input, new Date(), true);
        const orderNumber = newOrderNumber();

        const order = await m.getRepository(Order).save(
          m.getRepository(Order).create({
            orderNumber,
            userId: user.id,
            status: 'placed',
            paymentMethod: input.paymentMethod,
            paymentStatus: 'unpaid',
            subtotalPaise: prepared.totals.subtotalPaise,
            shippingPaise: prepared.totals.shippingPaise,
            taxPaise: prepared.totals.taxPaise,
            totalPaise: prepared.totals.totalPaise,
            shippingAddress: {
              fullName: prepared.address.fullName,
              phone: prepared.address.phone,
              line1: prepared.address.line1,
              line2: prepared.address.line2,
              city: prepared.address.city,
              state: prepared.address.state,
              pincode: prepared.address.pincode,
            },
            idempotencyKey,
            requestHash,
            cancelledAt: null,
          }),
        );

        await m.getRepository(OrderItem).save(
          prepared.lines.map((l) =>
            m.getRepository(OrderItem).create({
              orderId: order.id,
              productId: l.productId,
              productName: l.productName,
              brandName: l.brandName,
              modelNumber: l.modelNumber,
              unitPricePaise: l.unitPricePaise,
              quantity: l.quantity,
              lineTotalPaise: l.lineTotalPaise,
            }),
          ),
        );

        for (const line of prepared.lines) {
          await this.productAdmin.applyStockDelta(m, line.productId, -line.quantity, 'order', user.id, `Order ${orderNumber}`, order.id);
          await m.getRepository(Product).increment({ id: line.productId }, 'soldCount', line.quantity);
        }

        await this.cartService.clear(m, user.id);
        return { orderId: order.id, replayed: false };
      });
      return { replayed: outcome.replayed, order: await this.loadView(user.id, outcome.orderId) };
    } catch (err) {
      // Two identical requests raced. The loser's insert hit the idempotency key, so return the winner's order.
      if (isUniqueViolation(err)) {
        const winner = await this.orders.findOne({ where: { userId: user.id, idempotencyKey } });
        if (winner) return this.replay(user.id, winner, requestHash);
      }
      throw err;
    }
  }

  async list(userId: number, page: number, limit: number) {
    const [rows, total] = await this.orders.findAndCount({
      where: { userId },
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const items = rows.length ? await this.orderItems.find({ where: { orderId: In(rows.map((r) => r.id)) } }) : [];
    return paged(
      rows.map((r) => toOrderView(r, items)),
      page,
      limit,
      total,
    );
  }

  async detail(userId: number, id: number) {
    const order = await this.orders.findOne({ where: { id, userId } });
    if (!order) throw AppError.notFound('Order not found.', 'ORDER_NOT_FOUND');
    const items = await this.orderItems.find({ where: { orderId: id } });
    return toOrderView(order, items);
  }

  private async replay(userId: number, existing: Order, requestHash: string) {
    if (existing.requestHash !== requestHash) {
      throw AppError.unprocessable('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different order.');
    }
    return { replayed: true, order: await this.loadView(userId, existing.id) };
  }

  private async loadView(userId: number, orderId: number) {
    const order = await this.orders.findOneOrFail({ where: { id: orderId, userId } });
    const items = await this.orderItems.find({ where: { orderId } });
    return toOrderView(order, items);
  }

  /**
   * Shared by quote and place. With `lock`, the product rows are locked (in id
   * order, to avoid deadlocks) so no other checkout can change stock meanwhile.
   */
  private async prepare(m: EntityManager, userId: number, input: PlaceOrderInput, now: Date, lock: boolean): Promise<Prepared> {
    const address = await m.getRepository(Address).findOne({ where: { id: input.addressId, userId } });
    if (!address) throw AppError.notFound('Address not found.', 'ADDRESS_NOT_FOUND');

    const cartRows = await m.getRepository(CartItem).find({ where: { userId }, order: { id: 'ASC' } });
    if (!cartRows.length) throw AppError.unprocessable('CART_EMPTY', 'Your cart is empty.');

    const productIds = [...new Set(cartRows.map((r) => r.productId))].sort((a, b) => a - b);
    // Locks are taken without relations: FOR UPDATE cannot be combined with an outer join.
    const products = await m.getRepository(Product).find({
      where: { id: In(productIds) },
      lock: lock ? { mode: 'pessimistic_write' } : undefined,
      order: { id: 'ASC' },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const brandIds = [...new Set(products.map((p) => p.brandId))];
    const brands = brandIds.length ? await m.getRepository(Brand).find({ where: { id: In(brandIds) } }) : [];
    const brandName = new Map(brands.map((b) => [b.id, b.name]));

    const archived = cartRows.filter((r) => !byId.get(r.productId)?.isActive).map((r) => String(r.productId));
    if (archived.length) {
      throw AppError.conflict('PRODUCT_UNAVAILABLE', 'Some items in your cart are no longer available. Remove them and try again.', {
        productIds: archived,
      });
    }

    const short = cartRows
      .map((r) => ({ row: r, product: byId.get(r.productId)! }))
      .filter(({ row, product }) => product.stockQuantity < row.quantity)
      .map(({ row, product }) => ({
        productId: String(row.productId),
        name: product.name,
        requested: row.quantity,
        available: product.stockQuantity,
      }));
    if (short.length) throw AppError.conflict('INSUFFICIENT_STOCK', 'Some items do not have enough stock.', { items: short });

    const rules = requireConfiguredRules(this.config.get<AppEnv>('app')!.store);

    const lines: PreparedLine[] = cartRows.map((r) => {
      const p = byId.get(r.productId)!;
      const unit = effectivePricePaise(p, now);
      return {
        productId: p.id,
        productName: p.name,
        brandName: brandName.get(p.brandId) ?? '',
        modelNumber: p.modelNumber,
        unitPricePaise: unit,
        quantity: r.quantity,
        lineTotalPaise: unit * r.quantity,
      };
    });
    const subtotalPaise = lines.reduce((sum, l) => sum + l.lineTotalPaise, 0);

    assertOrderAllowed(rules, { subtotalPaise, pincode: address.pincode, paymentMethod: input.paymentMethod });
    const totals = computeTotals(subtotalPaise, rules);
    return { address, lines, rules, totals };
  }
}

function hashRequest(input: PlaceOrderInput): string {
  return createHash('sha256').update(JSON.stringify({ addressId: input.addressId, paymentMethod: input.paymentMethod })).digest('hex');
}

/** VLT-YYYYMMDD-XXXXXXXX. The random part makes collisions negligible; the unique index is the backstop. */
function newOrderNumber(now: Date = new Date()): string {
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `VLT-${d}-${randomBytes(4).toString('hex').toUpperCase()}`;
}
