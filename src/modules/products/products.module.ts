import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Brand } from '../../database/entities/brand.entity';
import { Category } from '../../database/entities/category.entity';
import { InventoryMovement } from '../../database/entities/commerce.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductComboItem, ProductImage, ProductSpecRow } from '../../database/entities/product-related.entity';
import { User } from '../../database/entities/user.entity';
import { AdminInventoryController, AdminProductsController } from './admin-products.controller';
import { ProductAdminService } from './product-admin.service';
import { ProductService } from './product.service';
import { ProductsController } from './products.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Brand,
      Category,
      ProductImage,
      ProductSpecRow,
      ProductComboItem,
      InventoryMovement,
      User,
    ]),
  ],
  controllers: [ProductsController, AdminProductsController, AdminInventoryController],
  providers: [ProductService, ProductAdminService],
  exports: [ProductService, ProductAdminService, TypeOrmModule],
})
export class ProductsModule {}
