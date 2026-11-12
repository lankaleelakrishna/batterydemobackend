import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryMovement } from '../../database/entities/commerce.entity';
import { Order, OrderItem } from '../../database/entities/order.entity';
import { Product } from '../../database/entities/product.entity';
import { User } from '../../database/entities/user.entity';
import { ProductsModule } from '../products/products.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Order, OrderItem, Product, InventoryMovement]), ProductsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
