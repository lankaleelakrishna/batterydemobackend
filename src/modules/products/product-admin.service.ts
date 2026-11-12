import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, unlinkSync } from 'fs';
import { basename, join } from 'path';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { AppEnv } from '../../config/env';
import { AppError } from '../../common/errors';
import { paged } from '../../common/pagination';
import { imageMatchesMagicBytes, UPLOAD_DIR } from '../../common/uploads';
import { slugify } from '../../common/text';
import { Brand } from '../../database/entities/brand.entity';
import { Category } from '../../database/entities/category.entity';
import { InventoryMovement } from '../../database/entities/commerce.entity';
import { Product, ProductKindValue } from '../../database/entities/product.entity';
import { ProductComboItem, ProductImage, ProductSpecRow } from '../../database/entities/product-related.entity';
import { LOW_STOCK_THRESHOLD } from './catalogue-rules';
import {
  AdminProductListQueryDto,
  ComboItemsDto,
  InventoryAdjustmentDto,
  ProductInputDto,
} from './product.dto';
import { ProductService } from './product.service';
import { ProductView, ProductWithRelations } from './product.view';

const MAX_IMAGES_PER_PRODUCT = 12;

/** Business rules that depend on the product kind. Checked on create and on every update. */
export function validateKindRules(state: {
  kind: ProductKindValue;
  technology: string | null;
  capacityAh: number | null;
  ratingVa: number | null;
  listPricePaise: number;
  salePricePaise: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
}) {
  const problems: string[] = [];
  if (state.kind === 'battery') {
    if (!state.technology) problems.push('Batteries need a battery technology.');
    if (state.capacityAh === null) problems.push('Batteries need a capacity in Ah.');
    if (state.ratingVa !== null) problems.push('Batteries do not have an inverter rating in VA.');
  }
  if (state.kind === 'inverter') {
    if (state.ratingVa === null) problems.push('Inverters need a rating in VA.');
    if (state.technology !== null) problems.push('Inverters do not have a battery technology.');
    if (state.capacityAh !== null) problems.push('Inverters do not have a capacity in Ah.');
  }
  if (state.salePricePaise !== null) {
    if (state.salePricePaise >= state.listPricePaise) problems.push('The sale price must be lower than the list price.');
  }
  if (state.saleStartsAt && state.saleEndsAt && state.saleEndsAt <= state.saleStartsAt) {
    problems.push('The sale must end after it starts.');
  }
  if ((state.saleStartsAt || state.saleEndsAt) && state.salePricePaise === null) {
    problems.push('A sale window needs a sale price.');
  }
  if (problems.length) throw AppError.unprocessable('PRODUCT_RULES', problems.join(' '), { problems });
}

@Injectable()
export class ProductAdminService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(ProductImage) private readonly images: Repository<ProductImage>,
    @InjectRepository(ProductSpecRow) private readonly specs: Repository<ProductSpecRow>,
    @InjectRepository(ProductComboItem) private readonly comboItems: Repository<ProductComboItem>,
    @InjectRepository(InventoryMovement) private readonly movements: Repository<InventoryMovement>,
    private readonly storefront: ProductService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async list(q: AdminProductListQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const qb = this.products
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.brand', 'b')
      .innerJoinAndSelect('p.category', 'c');
    if (q.status === 'active') qb.andWhere('p.is_active = true');
    if (q.status === 'archived') qb.andWhere('p.is_active = false');
    if (q.q) {
      qb.andWhere(new Brackets((w) => {
        w.where('p.name ILIKE :s', { s: `%${escapeLike(q.q!)}%` })
          .orWhere('p.model_number ILIKE :s', { s: `%${escapeLike(q.q!)}%` })
          .orWhere('p.sku ILIKE :s', { s: `%${escapeLike(q.q!)}%` });
      }));
    }
    const total = await qb.clone().getCount();
    const rows = await qb
      .orderBy('p.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getMany();
    const data = await this.adminViews(rows as ProductWithRelations[]);
    return paged(data, page, limit, total);
  }

  async detail(id: number) {
    const row = await this.products.findOne({ where: { id }, relations: { brand: true, category: true } });
    if (!row) throw AppError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');
    const [view] = await this.adminViews([row as ProductWithRelations]);
    const components = row.kind === 'combo' ? await this.componentRows(id) : [];
    return { ...view, components };
  }

  async create(dto: ProductInputDto, actorId: number) {
    const missing = ['kind', 'brandId', 'categoryId', 'modelNumber', 'name', 'listPricePaise'].filter(
      (k) => (dto as Record<string, unknown>)[k] === undefined,
    );
    if (missing.length) throw AppError.badRequest('VALIDATION_FAILED', `Missing required fields: ${missing.join(', ')}.`, { fields: missing });

    const brand = await this.brands.findOne({ where: { id: dto.brandId! } });
    if (!brand) throw AppError.unprocessable('BRAND_NOT_FOUND', 'Choose a manufacturer that exists.');
    const category = await this.categories.findOne({ where: { id: dto.categoryId! } });
    if (!category) throw AppError.unprocessable('CATEGORY_NOT_FOUND', 'Choose a category that exists.');

    const slug = dto.slug ?? slugify(`${dto.name} ${dto.modelNumber}`);
    const state = {
      kind: dto.kind!,
      technology: dto.technology ?? null,
      capacityAh: dto.capacityAh ?? null,
      ratingVa: dto.ratingVa ?? null,
      listPricePaise: dto.listPricePaise!,
      salePricePaise: dto.salePricePaise ?? null,
      saleStartsAt: dto.saleStartsAt ?? null,
      saleEndsAt: dto.saleEndsAt ?? null,
    };
    validateKindRules(state);
    await this.assertSlugFree(slug);

    try {
      const id = await this.dataSource.transaction(async (m) => {
        const repo = m.getRepository(Product);
        const row = repo.create({
          slug,
          sku: dto.sku ?? null,
          kind: state.kind,
          brandId: brand.id,
          categoryId: category.id,
          modelNumber: dto.modelNumber!,
          name: dto.name!,
          tagline: dto.tagline ?? null,
          description: dto.description ?? '',
          technology: state.technology as Product['technology'],
          capacityAh: state.capacityAh,
          ratingVa: state.ratingVa,
          warrantyMonths: dto.warrantyMonths ?? null,
          lengthMm: dto.lengthMm ?? null,
          widthMm: dto.widthMm ?? null,
          heightMm: dto.heightMm ?? null,
          weightKg: dto.weightKg ?? null,
          listPricePaise: state.listPricePaise,
          salePricePaise: state.salePricePaise,
          saleStartsAt: state.saleStartsAt,
          saleEndsAt: state.saleEndsAt,
          stockQuantity: 0,
          acceptsPreorders: dto.acceptsPreorders ?? false,
          isFeatured: dto.isFeatured ?? false,
          isBestSeller: dto.isBestSeller ?? false,
          isActive: dto.isActive ?? true,
        });
        await repo.save(row);
        if (dto.specs) await this.replaceSpecs(m, row.id, dto.specs);
        if (dto.initialStock && dto.initialStock > 0) {
          await this.applyStockDelta(m, row.id, dto.initialStock, 'adjustment', actorId, 'Initial stock');
        }
        return row.id;
      });
      return this.detail(id);
    } catch (err) {
      if (isUnique(err, 'products_slug_unique') || isUnique(err, 'products_sku_unique')) {
        throw AppError.conflict('SLUG_OR_SKU_TAKEN', 'Another product already uses this slug or SKU.');
      }
      throw err;
    }
  }

  async update(id: number, dto: ProductInputDto) {
    if (dto.initialStock !== undefined) {
      throw AppError.badRequest('VALIDATION_FAILED', 'Stock is changed with inventory adjustments, not product edits.');
    }
    await this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(Product);
      const row = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw AppError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');

      if (dto.brandId !== undefined) {
        if (!(await this.brands.exists({ where: { id: dto.brandId } }))) throw AppError.unprocessable('BRAND_NOT_FOUND', 'Choose a manufacturer that exists.');
        row.brandId = dto.brandId;
      }
      if (dto.categoryId !== undefined) {
        if (!(await this.categories.exists({ where: { id: dto.categoryId } }))) throw AppError.unprocessable('CATEGORY_NOT_FOUND', 'Choose a category that exists.');
        row.categoryId = dto.categoryId;
      }
      if (dto.slug !== undefined && dto.slug !== row.slug) {
        await this.assertSlugFree(dto.slug, id);
        row.slug = dto.slug;
      }
      if (dto.kind !== undefined) row.kind = dto.kind;
      if (dto.sku !== undefined) row.sku = dto.sku || null;
      if (dto.modelNumber !== undefined) row.modelNumber = dto.modelNumber;
      if (dto.name !== undefined) row.name = dto.name;
      if (dto.tagline !== undefined) row.tagline = dto.tagline || null;
      if (dto.description !== undefined) row.description = dto.description;
      if (dto.technology !== undefined) row.technology = dto.technology;
      if (dto.capacityAh !== undefined) row.capacityAh = dto.capacityAh;
      if (dto.ratingVa !== undefined) row.ratingVa = dto.ratingVa;
      if (dto.warrantyMonths !== undefined) row.warrantyMonths = dto.warrantyMonths;
      if (dto.lengthMm !== undefined) row.lengthMm = dto.lengthMm;
      if (dto.widthMm !== undefined) row.widthMm = dto.widthMm;
      if (dto.heightMm !== undefined) row.heightMm = dto.heightMm;
      if (dto.weightKg !== undefined) row.weightKg = dto.weightKg;
      if (dto.listPricePaise !== undefined) row.listPricePaise = dto.listPricePaise;
      if (dto.salePricePaise !== undefined) row.salePricePaise = dto.salePricePaise;
      if (dto.saleStartsAt !== undefined) row.saleStartsAt = dto.saleStartsAt;
      if (dto.saleEndsAt !== undefined) row.saleEndsAt = dto.saleEndsAt;
      if (dto.acceptsPreorders !== undefined) row.acceptsPreorders = dto.acceptsPreorders;
      if (dto.isFeatured !== undefined) row.isFeatured = dto.isFeatured;
      if (dto.isBestSeller !== undefined) row.isBestSeller = dto.isBestSeller;
      if (dto.isActive !== undefined) row.isActive = dto.isActive;

      validateKindRules({
        kind: row.kind,
        technology: row.technology,
        capacityAh: row.capacityAh,
        ratingVa: row.ratingVa,
        listPricePaise: row.listPricePaise,
        salePricePaise: row.salePricePaise,
        saleStartsAt: row.saleStartsAt,
        saleEndsAt: row.saleEndsAt,
      });

      try {
        await repo.save(row);
      } catch (err) {
        if (isUnique(err, 'products_slug_unique') || isUnique(err, 'products_sku_unique')) {
          throw AppError.conflict('SLUG_OR_SKU_TAKEN', 'Another product already uses this slug or SKU.');
        }
        throw err;
      }
      if (dto.specs !== undefined) await this.replaceSpecs(m, id, dto.specs);
    });
    return this.detail(id);
  }

  /** Archives a product. Archived products disappear from the storefront but keep their order history. */
  async setActive(id: number, active: boolean) {
    const result = await this.products.update({ id }, { isActive: active });
    if (!result.affected) throw AppError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');
    return this.detail(id);
  }

  async setComponents(id: number, dto: ComboItemsDto) {
    const combo = await this.products.findOne({ where: { id } });
    if (!combo) throw AppError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');
    if (combo.kind !== 'combo') throw AppError.unprocessable('NOT_A_COMBO', 'Only combo products have components.');

    const componentIds = dto.items.map((i) => i.componentProductId);
    if (new Set(componentIds).size !== componentIds.length) throw AppError.unprocessable('DUPLICATE_COMPONENT', 'Each component can be listed once.');
    if (componentIds.includes(id)) throw AppError.unprocessable('SELF_COMPONENT', 'A combo cannot contain itself.');

    if (componentIds.length) {
      const found = await this.products.find({ where: { id: In(componentIds) } });
      if (found.length !== componentIds.length) throw AppError.unprocessable('COMPONENT_NOT_FOUND', 'One or more components do not exist.');
      if (found.some((p) => p.kind === 'combo')) throw AppError.unprocessable('NESTED_COMBO', 'Components must be batteries or inverters, not combos.');
      if (found.some((p) => !p.isActive)) throw AppError.unprocessable('COMPONENT_ARCHIVED', 'Archived products cannot be combo components.');
    }

    await this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(ProductComboItem);
      await repo.delete({ comboProductId: id });
      if (dto.items.length) {
        await repo.save(
          dto.items.map((i, idx) =>
            repo.create({ comboProductId: id, componentProductId: i.componentProductId, quantity: i.quantity, sortOrder: idx }),
          ),
        );
      }
    });
    return this.detail(id);
  }

  async addImage(id: number, file: Express.Multer.File | undefined, alt: string | undefined, sortOrder: number | undefined) {
    if (!file) throw AppError.badRequest('VALIDATION_FAILED', 'Attach an image in the "image" field.');
    const savedPath = join(UPLOAD_DIR, basename(file.path));
    const removeFile = () => {
      if (existsSync(savedPath)) unlinkSync(savedPath);
    };
    try {
      const product = await this.products.findOne({ where: { id } });
      if (!product) throw AppError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');
      const count = await this.images.count({ where: { productId: id } });
      if (count >= MAX_IMAGES_PER_PRODUCT) throw AppError.conflict('IMAGE_LIMIT', `A product can have up to ${MAX_IMAGES_PER_PRODUCT} images.`);
      if (!imageMatchesMagicBytes(savedPath, file.mimetype)) {
        throw AppError.unprocessable('UNSUPPORTED_IMAGE', 'The file is not a valid JPEG, PNG or WebP image.');
      }
      const app = this.config.get<AppEnv>('app')!;
      const row = this.images.create({
        productId: id,
        url: `${app.publicUrl}/uploads/${basename(file.path)}`,
        alt: (alt ?? '').slice(0, 200) || product.name,
        width: null,
        height: null,
        sortOrder: sortOrder ?? count,
      });
      await this.images.save(row);
      return { id: row.id, url: row.url, alt: row.alt, sortOrder: row.sortOrder };
    } catch (err) {
      removeFile();
      throw err;
    }
  }

  async removeImage(productId: number, imageId: number) {
    const row = await this.images.findOne({ where: { id: imageId, productId } });
    if (!row) throw AppError.notFound('Image not found.', 'IMAGE_NOT_FOUND');
    await this.images.delete({ id: imageId });
    const prefix = '/uploads/';
    const idx = row.url.indexOf(prefix);
    if (idx >= 0) {
      const file = join(UPLOAD_DIR, basename(row.url.slice(idx + prefix.length)));
      if (existsSync(file)) unlinkSync(file);
    }
    return { message: 'Image removed.' };
  }

  /** Changes stock by a signed amount and records the movement. Refuses to go below zero. */
  async adjustInventory(id: number, dto: InventoryAdjustmentDto, actorId: number) {
    return this.dataSource.transaction(async (m) => {
      await this.applyStockDelta(m, id, dto.delta, 'adjustment', actorId, dto.note ?? '');
      const row = await m.getRepository(Product).findOneByOrFail({ id });
      return { productId: id, stockQuantity: row.stockQuantity, lowStock: row.stockQuantity <= LOW_STOCK_THRESHOLD };
    });
  }

  async movementsFor(productId: number | undefined, page: number, limit: number) {
    const where = productId ? { productId } : {};
    const [rows, total] = await this.movements.findAndCount({
      where,
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paged(
      rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        delta: r.delta,
        reason: r.reason,
        orderId: r.orderId,
        actorUserId: r.actorUserId,
        note: r.note,
        createdAt: r.createdAt,
      })),
      page,
      limit,
      total,
    );
  }

  /**
   * Shared by admin adjustments, initial stock and checkout. Must run inside a
   * transaction. Locks the product row so concurrent updates cannot both succeed.
   */
  async applyStockDelta(
    m: EntityManager,
    productId: number,
    delta: number,
    reason: InventoryMovement['reason'],
    actorUserId: number | null,
    note: string,
    orderId: number | null = null,
  ) {
    const repo = m.getRepository(Product);
    const row = await repo.findOne({ where: { id: productId }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw AppError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');
    const next = row.stockQuantity + delta;
    if (next < 0) {
      throw AppError.conflict('INSUFFICIENT_STOCK', `Only ${row.stockQuantity} left in stock for ${row.name}.`, {
        productId,
        available: row.stockQuantity,
        requested: -delta,
      });
    }
    await repo.update({ id: productId }, { stockQuantity: next });
    await m.getRepository(InventoryMovement).save(
      m.getRepository(InventoryMovement).create({ productId, delta, reason, orderId, actorUserId, note }),
    );
    return next;
  }

  private async replaceSpecs(m: EntityManager, productId: number, specs: { label: string; value: string }[]) {
    const repo = m.getRepository(ProductSpecRow);
    const labels = specs.map((s) => s.label.toLowerCase());
    if (new Set(labels).size !== labels.length) throw AppError.unprocessable('DUPLICATE_SPEC', 'Each specification label can be used once.');
    await repo.delete({ productId });
    if (specs.length) {
      await repo.save(specs.map((s, i) => repo.create({ productId, label: s.label, value: s.value, sortOrder: i })));
    }
  }

  private async componentRows(comboId: number) {
    const links = await this.comboItems.find({ where: { comboProductId: comboId }, order: { sortOrder: 'ASC' } });
    const products = await this.storefront.loadByIds(links.map((l) => l.componentProductId));
    const byId = new Map(products.map((p) => [p.id, p]));
    return links.map((l) => ({ productId: l.componentProductId, quantity: l.quantity, name: byId.get(l.componentProductId)?.name ?? '' }));
  }

  private async assertSlugFree(slug: string, exceptId?: number) {
    const existing = await this.products.findOne({ where: { slug } });
    if (existing && existing.id !== exceptId) throw AppError.conflict('SLUG_OR_SKU_TAKEN', 'Another product already uses this slug.');
  }

  /** Admin views include stock, pricing windows, flags and image ids. Public views never do. */
  private async adminViews(rows: ProductWithRelations[]) {
    const views: ProductView[] = await this.storefront.toViews(rows);
    const ids = rows.map((r) => r.id);
    const images = ids.length ? await this.images.find({ where: { productId: In(ids) }, order: { sortOrder: 'ASC', id: 'ASC' } }) : [];
    return views.map((v) => {
      const row = rows.find((r) => String(r.id) === v.id)!;
      return {
        ...v,
        id: v.id,
        sku: row.sku,
        slug: row.slug,
        isActive: row.isActive,
        isFeatured: row.isFeatured,
        isBestSeller: row.isBestSeller,
        acceptsPreorders: row.acceptsPreorders,
        stockQuantity: row.stockQuantity,
        soldCount: row.soldCount,
        listPricePaise: row.listPricePaise,
        salePricePaise: row.salePricePaise,
        saleStartsAt: row.saleStartsAt,
        saleEndsAt: row.saleEndsAt,
        brandId: row.brandId,
        categoryId: row.categoryId,
        images: images
          .filter((i) => i.productId === row.id)
          .map((i) => ({ id: i.id, url: i.url, alt: i.alt, sortOrder: i.sortOrder })),
        updatedAt: row.updatedAt,
      };
    });
  }
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function isUnique(err: unknown, constraint: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === '23505' && e.constraint === constraint;
}
