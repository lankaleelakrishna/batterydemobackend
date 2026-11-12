import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Injectable, Module, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, IsUrl, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { AppError } from '../../common/errors';
import { JwtAuthGuard, Roles } from '../../common/auth/auth.guard';
import { slugify } from '../../common/text';
import { Brand } from '../../database/entities/brand.entity';
import { Product } from '../../database/entities/product.entity';
import { User } from '../../database/entities/user.entity';
import { isUniqueViolation } from '../auth/auth.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class BrandInputDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @Transform(trim)
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export interface BrandView {
  id: number;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  isActive: boolean;
}

function view(b: Brand): BrandView {
  return { id: b.id, name: b.name, slug: b.slug, description: b.description, logoUrl: b.logoUrl, isActive: b.isActive };
}

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
  ) {}

  /** Public list: active manufacturers only. Products are the manufacturer's, never VOLTEX's. */
  async listPublic() {
    const rows = await this.brands.find({ where: { isActive: true }, order: { name: 'ASC' } });
    return rows.map(view);
  }

  async listAdmin() {
    const rows = await this.brands.find({ order: { name: 'ASC' } });
    return rows.map(view);
  }

  async create(dto: BrandInputDto) {
    if (!dto.name) throw AppError.badRequest('VALIDATION_FAILED', 'Name is required.');
    const row = this.brands.create({
      name: dto.name,
      slug: slugify(dto.name),
      description: dto.description ?? '',
      logoUrl: dto.logoUrl ?? null,
      isActive: dto.isActive ?? true,
    });
    await this.save(row);
    return view(row);
  }

  async update(id: number, dto: BrandInputDto) {
    const row = await this.brands.findOne({ where: { id } });
    if (!row) throw AppError.notFound('Manufacturer not found.', 'BRAND_NOT_FOUND');
    if (dto.name !== undefined) {
      row.name = dto.name;
      row.slug = slugify(dto.name);
    }
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.logoUrl !== undefined) row.logoUrl = dto.logoUrl;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    await this.save(row);
    return view(row);
  }

  /** Refuses to delete a manufacturer that still has products. Deactivate it instead. */
  async remove(id: number) {
    const row = await this.brands.findOne({ where: { id } });
    if (!row) throw AppError.notFound('Manufacturer not found.', 'BRAND_NOT_FOUND');
    if (await this.products.exists({ where: { brandId: id } })) {
      throw AppError.conflict('BRAND_IN_USE', 'This manufacturer has products. Deactivate it instead of deleting it.');
    }
    await this.brands.delete({ id });
    return { message: 'Manufacturer deleted.' };
  }

  private async save(row: Brand) {
    try {
      await this.brands.save(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw AppError.conflict('BRAND_EXISTS', 'A manufacturer with this name already exists.');
      throw err;
    }
  }
}

@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  list() {
    return this.brands.listPublic();
  }
}

@Controller('admin/brands')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminBrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  list() {
    return this.brands.listAdmin();
  }

  @Post()
  create(@Body() dto: BrandInputDto) {
    return this.brands.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: BrandInputDto) {
    return this.brands.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.brands.remove(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Brand, Product, User])],
  controllers: [BrandsController, AdminBrandsController],
  providers: [BrandsService],
  exports: [BrandsService],
})
export class BrandsModule {}
