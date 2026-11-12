import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSourceOptions } from 'typeorm';
import { DatabaseEnv } from '../config/env';
import { Address } from './entities/address.entity';
import { Brand } from './entities/brand.entity';
import { Category } from './entities/category.entity';
import { User } from './entities/user.entity';
import { Product } from './entities/product.entity';
import { ProductComboItem, ProductImage, ProductSpecRow } from './entities/product-related.entity';
import { CartItem, InventoryMovement, NewsletterSubscriber, Review, Testimonial, WishlistItem } from './entities/commerce.entity';
import { Order, OrderItem } from './entities/order.entity';

export const ENTITIES = [
  User,
  Address,
  Brand,
  Category,
  Product,
  ProductImage,
  ProductSpecRow,
  ProductComboItem,
  InventoryMovement,
  Review,
  Testimonial,
  NewsletterSubscriber,
  WishlistItem,
  CartItem,
  Order,
  OrderItem,
];

/**
 * Schema is managed only by explicit migrations. `synchronize` is always false
 * and is not configurable, so the schema can never change silently at boot.
 */
export function buildTypeOrmOptions(db: DatabaseEnv): DataSourceOptions {
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.user,
    password: db.password,
    database: db.database,
    ssl: db.ssl
      ? { rejectUnauthorized: true, ...(db.sslCaFile ? { ca: readFileSync(db.sslCaFile, 'utf8') } : {}) }
      : false,
    entities: ENTITIES,
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'schema_migrations',
    synchronize: false,
    migrationsRun: false,
    logging: false,
  };
}
