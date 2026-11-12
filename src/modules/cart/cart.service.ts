import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AppError } from '../../common/errors';
import { compareAtPaise, effectivePricePaise } from '../../common/pricing';
import { toRupees } from '../../common/money';
import { CartItem } from '../../database/entities/commerce.entity';
import { Product } from '../../database/entities/product.entity';
import { MAX_CART_QUANTITY } from '../products/catalogue-rules';
import { ProductService } from '../products/product.service';
import { ProductView } from '../products/product.view';
import { mergeCartQuantities, CartLineInput, clampQuantity } from './cart-merge';

export interface CartView {
  items: { productId: string; quantity: number; lineTotal: number; product: ProductView }[];
  totals: { itemCount: number; subtotal: number; savings: number };
  maxQuantity: number;
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartItem) private readonly items: Repository<CartItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly storefront: ProductService,
    private readonly dataSource: DataSource,
  ) {}

  /** Cart with current prices. Archived products are left out, and checkout refuses them. */
  async view(userId: number, now: Date = new Date()): Promise<CartView> {
    const rows = await this.items.find({ where: { userId }, order: { id: 'ASC' } });
    const products = await this.storefront.loadByIds(rows.map((r) => r.productId));
    const active = products.filter((p) => p.isActive);
    const views = await this.storefront.toViews(active, now);
    const viewById = new Map(views.map((v) => [Number(v.id), v]));
    const byProduct = new Map(active.map((p) => [p.id, p]));

    const items: CartView['items'] = [];
    let itemCount = 0;
    let subtotalPaise = 0;
    let savingsPaise = 0;
    for (const row of rows) {
      const product = viewById.get(row.productId);
      const entity = byProduct.get(row.productId);
      if (!product || !entity) continue;
      const unit = effectivePricePaise(entity, now);
      const compareAt = compareAtPaise(entity, now) ?? unit;
      itemCount += row.quantity;
      subtotalPaise += unit * row.quantity;
      savingsPaise += (compareAt - unit) * row.quantity;
      items.push({
        productId: String(row.productId),
        quantity: row.quantity,
        lineTotal: toRupees(unit * row.quantity),
        product,
      });
    }
    return {
      items,
      totals: { itemCount, subtotal: toRupees(subtotalPaise), savings: toRupees(savingsPaise) },
      maxQuantity: MAX_CART_QUANTITY,
    };
  }

  async setQuantity(userId: number, productId: number, quantity: number) {
    const product = await this.products.findOne({ where: { id: productId, isActive: true } });
    if (!product) throw AppError.notFound('This product is no longer available.', 'PRODUCT_NOT_FOUND');
    await this.upsert(this.dataSource.manager, userId, productId, clampQuantity(quantity, MAX_CART_QUANTITY));
    return this.view(userId);
  }

  async remove(userId: number, productId: number) {
    await this.items.delete({ userId, productId });
    return this.view(userId);
  }

  /** Merges guest lines into the account cart. Unknown or archived products are skipped and reported. */
  async merge(userId: number, guest: CartLineInput[]) {
    const ids = [...new Set(guest.map((g) => g.productId))];
    const live = ids.length ? await this.products.find({ where: { id: In(ids), isActive: true } }) : [];
    const liveIds = new Set(live.map((p) => p.id));
    const usable = guest.filter((g) => liveIds.has(g.productId));

    const existing = await this.items.find({ where: { userId } });
    const merged = mergeCartQuantities(
      existing.map((e) => ({ productId: e.productId, quantity: e.quantity })),
      usable,
      MAX_CART_QUANTITY,
    );

    await this.dataSource.transaction(async (m) => {
      for (const [productId, quantity] of merged) {
        await this.upsert(m, userId, productId, quantity);
      }
    });

    const view = await this.view(userId);
    return { ...view, skipped: guest.length - usable.length };
  }

  /** Removes every line. Called inside the checkout transaction once the order is written. */
  async clear(m: EntityManager, userId: number) {
    await m.getRepository(CartItem).delete({ userId });
  }

  /**
   * Single atomic INSERT ... ON CONFLICT. A failed insert inside a transaction
   * would abort that transaction, so this avoids a check-then-insert race.
   */
  private async upsert(m: EntityManager, userId: number, productId: number, quantity: number) {
    await m
      .createQueryBuilder()
      .insert()
      .into(CartItem)
      .values({ userId, productId, quantity })
      .orUpdate(['quantity', 'updated_at'], ['user_id', 'product_id'])
      .execute();
  }
}
