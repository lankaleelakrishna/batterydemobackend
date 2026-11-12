import { ArrayMaxSize, IsArray, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Injectable, Module, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AppError } from '../../common/errors';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/auth.guard';
import { AuthUser } from '../../common/auth/auth.types';
import { WishlistItem } from '../../database/entities/commerce.entity';
import { Product } from '../../database/entities/product.entity';
import { User } from '../../database/entities/user.entity';
import { ProductsModule } from '../products/products.module';
import { ProductService } from '../products/product.service';
import { ProductView } from '../products/product.view';

class MergeWishlistDto {
  @IsArray()
  @ArrayMaxSize(200)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  productIds: number[];
}

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistItem) private readonly items: Repository<WishlistItem>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly storefront: ProductService,
    private readonly dataSource: DataSource,
  ) {}

  /** Saved products that are still active, newest first. */
  async list(userId: number): Promise<{ data: ProductView[] }> {
    const rows = await this.items.find({ where: { userId }, order: { id: 'DESC' } });
    const products = await this.storefront.loadByIds(rows.map((r) => r.productId));
    const active = rows
      .map((r) => products.find((p) => p.id === r.productId))
      .filter((p): p is NonNullable<typeof p> => p !== undefined && p.isActive);
    return { data: await this.storefront.toViews(active) };
  }

  async add(userId: number, productId: number) {
    const product = await this.products.findOne({ where: { id: productId, isActive: true } });
    if (!product) throw AppError.notFound('This product is no longer available.', 'PRODUCT_NOT_FOUND');
    await this.insertIgnore(userId, [productId]);
    return this.list(userId);
  }

  async remove(userId: number, productId: number) {
    await this.items.delete({ userId, productId });
    return this.list(userId);
  }

  /** Adds guest wishlist items. Duplicates and unknown products are ignored. */
  async merge(userId: number, productIds: number[]) {
    const unique = [...new Set(productIds)];
    const live = unique.length ? await this.products.find({ where: { id: In(unique), isActive: true } }) : [];
    await this.insertIgnore(userId, live.map((p) => p.id));
    return this.list(userId);
  }

  /** Idempotent insert. The unique index on (user, product) keeps one row per product. */
  private async insertIgnore(userId: number, productIds: number[]) {
    if (!productIds.length) return;
    await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(WishlistItem)
      .values(productIds.map((productId) => ({ userId, productId })))
      .orIgnore()
      .execute();
  }
}

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.wishlist.list(user.id);
  }

  @Put(':productId')
  add(@CurrentUser() user: AuthUser, @Param('productId', ParseIntPipe) productId: number) {
    return this.wishlist.add(user.id, productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('productId', ParseIntPipe) productId: number) {
    return this.wishlist.remove(user.id, productId);
  }

  @Post('merge')
  merge(@CurrentUser() user: AuthUser, @Body() dto: MergeWishlistDto) {
    return this.wishlist.merge(user.id, dto.productIds);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([WishlistItem, Product, User]), ProductsModule],
  controllers: [WishlistController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
