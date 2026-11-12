import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Injectable, Module, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { Repository } from 'typeorm';
import { AppError } from '../../common/errors';
import { JwtAuthGuard, Roles } from '../../common/auth/auth.guard';
import { slugify } from '../../common/text';
import { Category } from '../../database/entities/category.entity';
import { Product } from '../../database/entities/product.entity';
import { User } from '../../database/entities/user.entity';
import { isUniqueViolation } from '../auth/auth.service';

/** Matches the frontend's `Category.visual` values (kinds and battery technologies). */
export const CATEGORY_VISUALS = [
  'battery',
  'inverter',
  'combo',
  'lithium-ion',
  'tall-tubular',
  'short-tubular',
  'flat-plate',
  'smf',
  'solar',
  'accessory',
] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CategoryInputDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 140)
  slug?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parentId?: number | null;

  @IsOptional()
  @IsIn(CATEGORY_VISUALS as readonly string[])
  visual?: (typeof CATEGORY_VISUALS)[number];

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Public shape, matching the frontend's `Category` type. */
export interface CategoryView {
  id: string;
  slug: string;
  name: string;
  description: string;
  visual: string;
  image?: { url: string; alt: string };
  productCount?: number;
}

interface AdminCategoryView {
  id: number;
  slug: string;
  name: string;
  description: string;
  parentId: number | null;
  visual: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  /**
   * Top-level categories by default. Pass `parentSlug` to list that category's subcategories.
   * A top-level count includes its subcategories.
   */
  async listPublic(parentSlug?: string): Promise<CategoryView[]> {
    const rows = await this.categories.find({ where: { isActive: true }, order: { sortOrder: 'ASC', id: 'ASC' } });
    const counts: { category_id: number; cnt: number }[] = await this.products.query(
      `SELECT category_id, COUNT(*)::int AS cnt FROM products WHERE is_active = true GROUP BY category_id`,
    );
    const direct = new Map(counts.map((c) => [Number(c.category_id), Number(c.cnt)]));

    let visible: Category[];
    if (parentSlug) {
      const parent = rows.find((r) => r.slug === parentSlug);
      visible = parent ? rows.filter((r) => r.parentId === parent.id) : [];
    } else {
      visible = rows.filter((r) => r.parentId === null);
    }

    return visible.map((c) => {
      const children = rows.filter((r) => r.parentId === c.id).map((r) => r.id);
      const productCount = [c.id, ...children].reduce((sum, id) => sum + (direct.get(id) ?? 0), 0);
      return {
        id: String(c.id),
        slug: c.slug,
        name: c.name,
        description: c.description,
        visual: c.visual,
        ...(c.imageUrl ? { image: { url: c.imageUrl, alt: c.name } } : {}),
        productCount,
      };
    });
  }

  async listAdmin(): Promise<AdminCategoryView[]> {
    const rows = await this.categories.find({ order: { sortOrder: 'ASC', id: 'ASC' } });
    return rows.map(adminView);
  }

  async create(dto: CategoryInputDto): Promise<AdminCategoryView> {
    if (!dto.name) throw AppError.badRequest('VALIDATION_FAILED', 'Name is required.');
    await this.assertParent(dto.parentId ?? null, null);
    const row = this.categories.create({
      name: dto.name,
      slug: dto.slug ?? slugify(dto.name),
      description: dto.description ?? '',
      parentId: dto.parentId ?? null,
      visual: dto.visual ?? 'battery',
      imageUrl: dto.imageUrl ?? null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    await this.save(row);
    return adminView(row);
  }

  async update(id: number, dto: CategoryInputDto): Promise<AdminCategoryView> {
    const row = await this.categories.findOne({ where: { id } });
    if (!row) throw AppError.notFound('Category not found.', 'CATEGORY_NOT_FOUND');
    if (dto.parentId !== undefined) {
      await this.assertParent(dto.parentId, id);
      row.parentId = dto.parentId;
    }
    if (dto.name !== undefined) {
      row.name = dto.name;
      if (dto.slug === undefined) row.slug = slugify(dto.name);
    }
    if (dto.slug !== undefined) row.slug = dto.slug;
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.visual !== undefined) row.visual = dto.visual;
    if (dto.imageUrl !== undefined) row.imageUrl = dto.imageUrl;
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    await this.save(row);
    return adminView(row);
  }

  async remove(id: number) {
    const row = await this.categories.findOne({ where: { id } });
    if (!row) throw AppError.notFound('Category not found.', 'CATEGORY_NOT_FOUND');
    if (await this.categories.exists({ where: { parentId: id } })) {
      throw AppError.conflict('CATEGORY_HAS_CHILDREN', 'Move or delete the subcategories first.');
    }
    if (await this.products.exists({ where: { categoryId: id } })) {
      throw AppError.conflict('CATEGORY_IN_USE', 'This category has products. Deactivate it instead of deleting it.');
    }
    await this.categories.delete({ id });
    return { message: 'Category deleted.' };
  }

  /** Only one level of nesting is supported: subcategories cannot have their own subcategories. */
  private async assertParent(parentId: number | null, selfId: number | null) {
    if (parentId === null) return;
    if (parentId === selfId) throw AppError.unprocessable('CATEGORY_CYCLE', 'A category cannot be its own parent.');
    const parent = await this.categories.findOne({ where: { id: parentId } });
    if (!parent) throw AppError.unprocessable('CATEGORY_NOT_FOUND', 'The parent category does not exist.');
    if (parent.parentId !== null) throw AppError.unprocessable('CATEGORY_TOO_DEEP', 'Subcategories can only sit one level below a top-level category.');
    if (selfId !== null && (await this.categories.exists({ where: { parentId: selfId } }))) {
      throw AppError.unprocessable('CATEGORY_TOO_DEEP', 'This category has subcategories, so it cannot become a subcategory.');
    }
  }

  private async save(row: Category) {
    try {
      await this.categories.save(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw AppError.conflict('CATEGORY_EXISTS', 'A category with this slug already exists.');
      throw err;
    }
  }
}

function adminView(c: Category): AdminCategoryView {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    parentId: c.parentId,
    visual: c.visual,
    imageUrl: c.imageUrl,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
  };
}

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query('parent') parent?: string) {
    return this.categories.listPublic(parent && /^[a-z0-9-]{1,140}$/.test(parent) ? parent : undefined);
  }
}

@Controller('admin/categories')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list() {
    return this.categories.listAdmin();
  }

  @Post()
  create(@Body() dto: CategoryInputDto) {
    return this.categories.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: CategoryInputDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categories.remove(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Category, Product, User])],
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
