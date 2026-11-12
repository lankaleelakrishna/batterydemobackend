import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsletterSubscriber, Review, Testimonial } from '../../database/entities/commerce.entity';
import { Product } from '../../database/entities/product.entity';
import { User } from '../../database/entities/user.entity';
import { ProductsModule } from '../products/products.module';
import {
  AdminContentController,
  NewsletterController,
  ProductReviewsController,
  ReviewsController,
  TestimonialsController,
} from './content.controller';
import { NewsletterService, ReviewsService, TestimonialsService } from './content.service';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Testimonial, NewsletterSubscriber, Product, User]), ProductsModule],
  controllers: [ProductReviewsController, ReviewsController, TestimonialsController, NewsletterController, AdminContentController],
  providers: [ReviewsService, TestimonialsService, NewsletterService],
})
export class ContentModule {}
