import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository, SelectQueryBuilder } from 'typeorm';
import { AppError } from '../../common/errors';
import { Paged, paged } from '../../common/pagination';
import { Brand } from '../../database/entities/brand.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductComboItem, ProductImage, ProductSpecRow } from '../../database/entities/product-related.entity';
import {
  CAPACITY_BUCKETS,
  DEFAULT_PAGE_SIZE,
  KIND_LABEL,
  KIND_VALUES,
  PRICE_BUCKETS,
  TECHNOLOGY_LABEL,
  TECHNOLOGY_VALUES,
  SortValue,
  parseCsv,
  pickAllowed,
} from './catalogue-rules';
import { ProductQueryDto } from './product.dto';
import { ProductView, RatingSummary, toProductView, ProductWithRelations } from './product.view';

/** Effective price in SQL, honouring the sale window. Mirrors `effectivePricePaise` in common/pricing.ts. */
const EFFECTIVE_PRICE_SQL = `(CASE
  WHEN p.sale_price_paise IS NOT NULL
    AND p.sale_price_paise < p.list_price_paise
    AND (p.sale_starts_at IS NULL OR p.sale_starts_at <= :now)
    AND (p.sale_ends_at IS NULL OR p.sale_ends_at > :now)
  THEN p.sale_price_paise
  ELSE p.list_price_paise END)`;

const KIND_CASE_SQL = `(CASE p.kind ${Object.entries(KIND_LABEL)
  .map(([k, v]) => `WHEN '${k}' THEN '${v}'`)
  .join(' ')} END)`;
const TECH_CASE_SQL = `(CASE p.technology ${Object.entries(TECHNOLOGY_LABEL)
  .map(([k, v]) => `WHEN '${k}' THEN '${v}'`)
  .join(' ')} ELSE '' END)`;

/** Search haystack: same fields the storefront searched, with all non-alphanumerics removed. */
const SEARCH_HAYSTACK_SQL = `regexp_replace(lower(concat_ws(' ', p.name, b.name, p.model_number, p.tagline, ${KIND_CASE_SQL}, ${TECH_CASE_SQL})), '[^a-z0-9]+', '', 'g')`;

export interface Facets {
  kinds: { value: string; count: number }[];
  brands: { key: string; label: string; count: number }[];
  technologies: { value: string; count: number }[];
}

export interface Suggestions {
  products: ProductView[];
  total: number;
  brands: { key: string; label: string }[];
}

/** Storefront-facing product reads. Writes live in ProductAdminService. */
@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductImage) private readonly images: Repository<ProductImage>,
    @InjectRepository(ProductSpecRow) private readonly specs: Repository<ProductSpecRow>,
    @InjectRepository(ProductComboItem) private readonly comboItems: Repository<ProductComboItem>,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    private readonly dataSource: DataSource,
  ) {}

  /** Loads relations for the given ids and returns them in the same order. */
  async loadByIds(ids: number[]): Promise<ProductWithRelations[]> {
    if (!ids.length) return [];
    const rows = await this.products.find({ where: { id: In(ids) }, relations: { brand: true, category: true } });
    const byId = new Map(rows.map((r) => [r.id, r as ProductWithRelations]));
    return ids.map((id) => byId.get(id)).filter((r): r is ProductWithRelations => r !== undefined);
  }

  /** Builds storefront views for the given products, with one query per related table. */
  async toViews(list: ProductWithRelations[], now: Date = new Date()): Promise<ProductView[]> {
    if (!list.length) return [];
    const ids = list.map((p) => p.id);
    const [images, specs, ratings] = await Promise.all([
      this.images.find({ where: { productId: In(ids) } }),
      this.specs.find({ where: { productId: In(ids) } }),
      this.ratingsFor(ids),
    ]);
    return list.map((p) => toProductView(p, { images, specs, rating: ratings.get(p.id), now }));
  }

  async ratingsFor(ids: number[]): Promise<Map<number, RatingSummary>> {
    const map = new Map<number, RatingSummary>();
    if (!ids.length) return map;
    const rows: { product_id: number; avg: string; cnt: number }[] = await this.dataSource.query(
      `SELECT product_id, AVG(rating)::float8 AS avg, COUNT(*)::int AS cnt
         FROM reviews
        WHERE product_id = ANY($1) AND status = 'approved'
        GROUP BY product_id`,
      [ids],
    );
    for (const r of rows) {
      map.set(r.product_id, { average: Math.round(Number(r.avg) * 10) / 10, count: Number(r.cnt) });
    }
    return map;
  }

  /** GET /products. Filters, search, sort and paging all run in the database. */
  async list(query: ProductQueryDto, now: Date = new Date()): Promise<Paged<ProductView>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const base = this.filteredQuery(query, now);

    const totalRow = await base.clone().select('COUNT(p.id)', 'total').getRawOne<{ total: string }>();
    const total = Number(totalRow?.total ?? 0);

    const ordered = this.applySort(base.clone(), query.sort ?? 'featured', now);
    const idRows = await ordered
      .select('p.id', 'id')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{ id: number }>();

    const products = await this.loadByIds(idRows.map((r) => Number(r.id)));
    return paged(await this.toViews(products, now), page, limit, total);
  }

  /** Full-text style search for the autocomplete panel. */
  async suggest(q: string, limit: number, now: Date = new Date()): Promise<Suggestions> {
    const list = await this.list({ q, limit, page: 1 }, now);
    const term = normalizeTerm(q);
    let brands: { key: string; label: string }[] = [];
    if (term) {
      const rows: { key: string; label: string }[] = await this.dataSource.query(
        `SELECT DISTINCT b.slug AS key, b.name AS label
           FROM brands b
           JOIN products p ON p.brand_id = b.id AND p.is_active = true
          WHERE b.is_active = true
            AND regexp_replace(lower(b.name), '[^a-z0-9]+', '', 'g') LIKE $1
          ORDER BY b.name ASC
          LIMIT 3`,
        [`%${term}%`],
      );
      brands = rows;
    }
    return { products: list.data, total: list.meta.total, brands };
  }

  async facets(): Promise<Facets> {
    const [kinds, brands, techs] = await Promise.all([
      this.dataSource.query(`SELECT kind AS value, COUNT(*)::int AS count FROM products WHERE is_active = true GROUP BY kind`),
      this.dataSource.query(
        `SELECT b.slug AS key, b.name AS label, COUNT(p.id)::int AS count
           FROM products p JOIN brands b ON b.id = p.brand_id
          WHERE p.is_active = true
          GROUP BY b.slug, b.name
          ORDER BY b.name ASC`,
      ),
      this.dataSource.query(
        `SELECT technology AS value, COUNT(*)::int AS count
           FROM products WHERE is_active = true AND technology IS NOT NULL
          GROUP BY technology`,
      ),
    ]);
    return {
      kinds: sortByOrder(kinds, KIND_VALUES),
      brands,
      technologies: sortByOrder(techs, TECHNOLOGY_VALUES),
    };
  }

  async featured(now: Date = new Date()): Promise<ProductView[]> {
    const rows = await this.products.find({
      where: { isActive: true, isFeatured: true },
      relations: { brand: true, category: true },
      order: { id: 'ASC' },
      take: 12,
    });
    return this.toViews(rows as ProductWithRelations[], now);
  }

  async bestSellers(now: Date = new Date()): Promise<ProductView[]> {
    const rows = await this.products.find({
      where: { isActive: true, isBestSeller: true },
      relations: { brand: true, category: true },
      order: { soldCount: 'DESC', id: 'ASC' },
      take: 12,
    });
    return this.toViews(rows as ProductWithRelations[], now);
  }

  /** Active product by slug. Archived or unknown slugs both return null. */
  async bySlug(slug: string, now: Date = new Date()): Promise<ProductView | null> {
    const row = await this.products.findOne({ where: { slug, isActive: true }, relations: { brand: true, category: true } });
    if (!row) return null;
    const [view] = await this.toViews([row as ProductWithRelations], now);
    return view ?? null;
  }

  async findActiveBySlug(slug: string): Promise<Product> {
    const row = await this.products.findOne({ where: { slug, isActive: true } });
    if (!row) throw AppError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');
    return row;
  }

  /** Components of a combo, for display only. Each entry includes its quantity in the combo. */
  async components(slug: string, now: Date = new Date()) {
    const combo = await this.findActiveBySlug(slug);
    if (combo.kind !== 'combo') return { data: [] };
    const links = await this.comboItems.find({ where: { comboProductId: combo.id }, order: { sortOrder: 'ASC', id: 'ASC' } });
    const components = await this.loadByIds(links.map((l) => l.componentProductId));
    const views = await this.toViews(components, now);
    const byId = new Map(views.map((v) => [Number(v.id), v]));
    const data = links
      .map((l) => ({ quantity: l.quantity, product: byId.get(l.componentProductId) }))
      .filter((x): x is { quantity: number; product: ProductView } => x.product !== undefined);
    return { data };
  }

  /** Base query with every filter applied. No ordering or paging. */
  filteredQuery(q: ProductQueryDto, now: Date): SelectQueryBuilder<Product> {
    const qb = this.products
      .createQueryBuilder('p')
      .innerJoin('p.brand', 'b')
      .innerJoin('p.category', 'c')
      .where('p.is_active = true')
      .setParameter('now', now);

    const ids = parseCsv(q.ids)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 50);
    if (ids.length) qb.andWhere('p.id IN (:...ids)', { ids });

    if (q.category) {
      qb.andWhere(
        `p.category_id IN (WITH RECURSIVE tree AS (
            SELECT id FROM categories WHERE slug = :category AND is_active = true
            UNION ALL
            SELECT ch.id FROM categories ch JOIN tree t ON ch.parent_id = t.id
          ) SELECT id FROM tree)`,
        { category: q.category },
      );
    }

    const types = pickAllowed(parseCsv(q.type), KIND_VALUES);
    if (types.length) qb.andWhere('p.kind IN (:...types)', { types });

    const brandSlugs = parseCsv(q.brand)
      .map((s) => s.toLowerCase())
      .filter((s) => /^[a-z0-9-]{1,140}$/.test(s));
    if (brandSlugs.length) qb.andWhere('b.slug IN (:...brandSlugs)', { brandSlugs });

    const techs = pickAllowed(parseCsv(q.tech), TECHNOLOGY_VALUES);
    if (techs.length) qb.andWhere('p.technology IN (:...techs)', { techs });

    const capacityIds = parseCsv(q.capacity);
    const capacityBuckets = CAPACITY_BUCKETS.filter((b) => capacityIds.includes(b.id));
    if (capacityBuckets.length) {
      qb.andWhere(
        new Brackets((w) =>
          capacityBuckets.forEach((b, i) => {
            const cond = b.max === null ? `p.capacity_ah >= :cMin${i}` : `(p.capacity_ah >= :cMin${i} AND p.capacity_ah < :cMax${i})`;
            const params: Record<string, number> = { [`cMin${i}`]: b.min };
            if (b.max !== null) params[`cMax${i}`] = b.max;
            if (i === 0) w.where(cond, params);
            else w.orWhere(cond, params);
          }),
        ),
      );
    }

    const priceIds = parseCsv(q.price);
    const priceBuckets = PRICE_BUCKETS.filter((b) => priceIds.includes(b.id));
    if (priceBuckets.length) {
      qb.andWhere(
        new Brackets((w) =>
          priceBuckets.forEach((b, i) => {
            const cond =
              b.max === null
                ? `${EFFECTIVE_PRICE_SQL} >= :pMin${i}`
                : `(${EFFECTIVE_PRICE_SQL} >= :pMin${i} AND ${EFFECTIVE_PRICE_SQL} < :pMax${i})`;
            const params: Record<string, number> = { [`pMin${i}`]: b.min };
            if (b.max !== null) params[`pMax${i}`] = b.max;
            if (i === 0) w.where(cond, params);
            else w.orWhere(cond, params);
          }),
        ),
      );
    }

    if (q.warranty !== undefined) qb.andWhere('p.warranty_months >= :warranty', { warranty: q.warranty });

    if (q.stock === '1') qb.andWhere('p.stock_quantity > 0');

    const tokens = (q.q ?? '')
      .split(/\s+/)
      .map(normalizeTerm)
      .filter(Boolean)
      .slice(0, 6);
    tokens.forEach((t, i) => {
      qb.andWhere(`${SEARCH_HAYSTACK_SQL} LIKE :tok${i}`, { [`tok${i}`]: `%${t}%` });
    });

    return qb;
  }

  private applySort(qb: SelectQueryBuilder<Product>, sort: SortValue, now: Date): SelectQueryBuilder<Product> {
    qb.setParameter('now', now);
    switch (sort) {
      case 'price-asc':
        return qb.orderBy(EFFECTIVE_PRICE_SQL, 'ASC').addOrderBy('p.id', 'ASC');
      case 'price-desc':
        return qb.orderBy(EFFECTIVE_PRICE_SQL, 'DESC').addOrderBy('p.id', 'ASC');
      case 'capacity-desc':
        return qb.orderBy('p.capacity_ah', 'DESC', 'NULLS LAST').addOrderBy('p.id', 'ASC');
      case 'warranty-desc':
        return qb.orderBy('p.warranty_months', 'DESC', 'NULLS LAST').addOrderBy('p.id', 'ASC');
      case 'rating-desc':
        return qb
          .orderBy(`(SELECT AVG(r.rating) FROM reviews r WHERE r.product_id = p.id AND r.status = 'approved')`, 'DESC', 'NULLS LAST')
          .addOrderBy('p.id', 'ASC');
      default:
        return qb.orderBy('p.is_featured', 'DESC').addOrderBy('p.id', 'ASC');
    }
  }

}

function normalizeTerm(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function sortByOrder<T extends { value: string }>(rows: T[], order: readonly string[]): T[] {
  return [...rows].sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value));
}
