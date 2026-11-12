import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WRITE_THROTTLE } from '../../common/throttle';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard, Roles } from '../../common/auth/auth.guard';
import { AuthUser } from '../../common/auth/auth.types';
import { NewsletterDto, ReviewInputDto, ReviewModerationDto, TestimonialInputDto } from './content.dto';
import { NewsletterService, ReviewsService, TestimonialsService } from './content.service';

class PagingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class ReviewStatusQueryDto extends PagingDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';
}

/** Public product reviews, and a signed-in customer's own review actions. */
@Controller('products')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get(':slug/reviews')
  list(@Param('slug') slug: string, @Query() q: PagingDto) {
    return this.reviews.listForProduct(slug, q.page ?? 1, q.limit ?? 10);
  }

  @Post(':slug/reviews')
  @UseGuards(JwtAuthGuard)
  @Throttle(WRITE_THROTTLE)
  create(@CurrentUser() user: AuthUser, @Param('slug') slug: string, @Body() dto: ReviewInputDto) {
    return this.reviews.create(user, slug, dto);
  }
}

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.reviews.remove(user, id);
  }
}

@Controller('testimonials')
export class TestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Get()
  list() {
    return this.testimonials.listPublished();
  }
}

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  @Post('subscribe')
  @Throttle(WRITE_THROTTLE)
  subscribe(@Body() dto: NewsletterDto) {
    return this.newsletter.subscribe(dto);
  }
}

@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminContentController {
  constructor(
    private readonly reviews: ReviewsService,
    private readonly testimonials: TestimonialsService,
    private readonly newsletter: NewsletterService,
  ) {}

  @Get('reviews')
  listReviews(@Query() q: ReviewStatusQueryDto) {
    return this.reviews.listAdmin(q.status, q.page ?? 1, q.limit ?? 20);
  }

  @Patch('reviews/:id')
  moderate(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewModerationDto) {
    return this.reviews.moderate(id, dto);
  }

  @Delete('reviews/:id')
  @HttpCode(HttpStatus.OK)
  removeReview(@Param('id', ParseIntPipe) id: number) {
    return this.reviews.removeAdmin(id);
  }

  @Get('testimonials')
  listTestimonials() {
    return this.testimonials.listAdmin();
  }

  @Post('testimonials')
  createTestimonial(@Body() dto: TestimonialInputDto) {
    return this.testimonials.create(dto);
  }

  @Put('testimonials/:id')
  updateTestimonial(@Param('id', ParseIntPipe) id: number, @Body() dto: TestimonialInputDto) {
    return this.testimonials.update(id, dto);
  }

  @Delete('testimonials/:id')
  @HttpCode(HttpStatus.OK)
  removeTestimonial(@Param('id', ParseIntPipe) id: number) {
    return this.testimonials.remove(id);
  }

  @Get('newsletter-subscribers')
  listSubscribers(@Query() q: PagingDto) {
    return this.newsletter.listAdmin(q.page ?? 1, q.limit ?? 20);
  }
}
