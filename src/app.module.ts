import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { loadAppEnv, AppEnv } from './config/env';
import { buildTypeOrmOptions } from './database/database.options';
import { RequestLoggerMiddleware } from './common/request-logger.middleware';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { ProfileModule } from './modules/users/profile.module';
import { BrandsModule } from './modules/brands/brands.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { ContentModule } from './modules/content/content.module';
import { CartModule } from './modules/cart/cart.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { OrdersModule } from './modules/orders/orders.module';
import { StoreModule } from './modules/store/store.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [() => ({ app: loadAppEnv() })],
    }),

    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const app = config.get<AppEnv>('app')!;
        return { secret: app.jwt.secret, signOptions: { expiresIn: app.jwt.expiresIn, issuer: app.jwt.issuer, audience: app.jwt.audience } };
      },
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const app = config.get<AppEnv>('app')!;
        return [{ ttl: app.rateLimit.ttlMs, limit: app.rateLimit.limit }];
      },
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildTypeOrmOptions(config.get<AppEnv>('app')!.database),
    }),

    AuthModule,
    ProfileModule,
    BrandsModule,
    CategoriesModule,
    ProductsModule,
    ContentModule,
    CartModule,
    WishlistModule,
    OrdersModule,
    StoreModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  constructor(private readonly config: ConfigService) {}

  configure(consumer: MiddlewareConsumer) {
    if (this.config.get<AppEnv>('app')!.logRequests) {
      consumer.apply(RequestLoggerMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
    }
  }
}
