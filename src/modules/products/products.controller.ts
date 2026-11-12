import { Controller, Get, Param, Query } from '@nestjs/common';
import { AppError } from '../../common/errors';
import { ProductQueryDto, SuggestQueryDto } from './product.dto';
import { ProductService } from './product.service';

/** Public storefront catalogue. Only active products are visible here. */
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductService) {}

  // Static routes are declared before ':slug' so they are not treated as slugs.
  @Get()
  list(@Query() query: ProductQueryDto) {
    return this.products.list(query);
  }

  @Get('facets')
  facets() {
    return this.products.facets();
  }

  /** Small homepage lists return a bare array of products. */
  @Get('featured')
  featured() {
    return this.products.featured();
  }

  @Get('best-sellers')
  bestSellers() {
    return this.products.bestSellers();
  }

  @Get('suggest')
  suggest(@Query() query: SuggestQueryDto) {
    return this.products.suggest(query.q, query.limit ?? 5);
  }

  @Get(':slug/components')
  components(@Param('slug') slug: string) {
    return this.products.components(slug);
  }

  @Get(':slug')
  async detail(@Param('slug') slug: string) {
    const product = await this.products.bySlug(slug);
    if (!product) throw AppError.notFound('Product not found.', 'PRODUCT_NOT_FOUND');
    return product;
  }
}
