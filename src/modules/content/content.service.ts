import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppError } from '../../common/errors';
import { paged } from '../../common/pagination';
import { AuthUser } from '../../common/auth/auth.types';
import { NewsletterSubscriber, Review, Testimonial } from '../../database/entities/commerce.entity';
import { Product } from '../../database/entities/product.entity';
import { User } from '../../database/entities/user.entity';
import { isUniqueViolation } from '../auth/auth.service';
import { ProductService } from '../products/product.service';
import { NewsletterDto, ReviewInputDto, ReviewModerationDto, TestimonialInputDto } from './content.dto';

/** Only the first name of a reviewer is shown publicly. */
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? 'Customer';
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly storefront: ProductService,
  ) {}

  /** Approved reviews for an active product, newest first, with the average rating. */
  async listForProduct(slug: string, page: number, limit: number) {
    const product = await this.storefront.findActiveBySlug(slug);
    const [rows, total] = await this.reviews
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.user', 'u')
      .where('r.productId = :pid', { pid: product.id })
      .andWhere("r.status = 'approved'")
      .orderBy('r.createdAt', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const ratings = await this.storefront.ratingsFor([product.id]);
    const summary = ratings.get(product.id) ?? { average: 0, count: 0 };
    return {
      ...paged(
        rows.map((r) => ({
          id: r.id,
          rating: r.rating,
          title: r.title,
          body: r.body,
          authorName: firstName(r.user.fullName),
          createdAt: r.createdAt,
        })),
        page,
        limit,
        total,
      ),
      summary,
    };
  }

  /** New reviews are pending until an admin approves them. One review per customer per product. */
  async create(user: AuthUser, slug: string, dto: ReviewInputDto) {
    const product = await this.storefront.findActiveBySlug(slug);
    try {
      const row = await this.reviews.save(
        this.reviews.create({
          productId: product.id,
          userId: user.id,
          rating: dto.rating,
          title: dto.title ?? '',
          body: dto.body,
          status: 'pending',
        }),
      );
      return { id: row.id, status: row.status, message: 'Thanks. Your review will appear once it has been approved.' };
    } catch (err) {
      if (isUniqueViolation(err)) throw AppError.conflict('REVIEW_EXISTS', 'You have already reviewed this product.');
      throw err;
    }
  }

  /** Customers may delete their own reviews. Admins may delete any review. */
  async remove(user: AuthUser, id: number) {
    const row = await this.reviews.findOne({ where: { id } });
    if (!row || (row.userId !== user.id && user.role !== 'admin')) {
      throw AppError.notFound('Review not found.', 'REVIEW_NOT_FOUND');
    }
    await this.reviews.delete({ id });
    return { message: 'Review deleted.' };
  }

  async listAdmin(status: 'pending' | 'approved' | 'rejected' | undefined, page: number, limit: number) {
    const qb = this.reviews
      .createQueryBuilder('r')
      .innerJoinAndSelect('r.user', 'u')
      .innerJoinAndSelect('r.product', 'p');
    if (status) qb.where('r.status = :status', { status });
    const [rows, total] = await qb
      .orderBy('r.createdAt', 'DESC')
      .addOrderBy('r.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return paged(
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        rating: r.rating,
        title: r.title,
        body: r.body,
        productId: r.productId,
        productName: r.product.name,
        customer: { id: r.user.id, email: r.user.email, fullName: r.user.fullName },
        createdAt: r.createdAt,
      })),
      page,
      limit,
      total,
    );
  }

  async moderate(id: number, dto: ReviewModerationDto) {
    const row = await this.reviews.findOne({ where: { id } });
    if (!row) throw AppError.notFound('Review not found.', 'REVIEW_NOT_FOUND');
    row.status = dto.status;
    await this.reviews.save(row);
    return { id: row.id, status: row.status };
  }

  async removeAdmin(id: number) {
    const result = await this.reviews.delete({ id });
    if (!result.affected) throw AppError.notFound('Review not found.', 'REVIEW_NOT_FOUND');
    return { message: 'Review deleted.' };
  }
}

export interface TestimonialView {
  id: string;
  author: string;
  location?: string;
  rating: number;
  body: string;
  productName?: string;
}

@Injectable()
export class TestimonialsService {
  constructor(@InjectRepository(Testimonial) private readonly testimonials: Repository<Testimonial>) {}

  async listPublished(): Promise<TestimonialView[]> {
    const rows = await this.testimonials.find({
      where: { isPublished: true },
      relations: { product: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return rows.map((t) => ({
      id: String(t.id),
      author: t.author,
      rating: t.rating,
      body: t.body,
      ...(t.location ? { location: t.location } : {}),
      ...(t.product ? { productName: t.product.name } : {}),
    }));
  }

  async listAdmin() {
    const rows = await this.testimonials.find({ relations: { product: true }, order: { sortOrder: 'ASC', id: 'ASC' } });
    return { data: rows.map((t) => ({ ...t, productName: t.product?.name ?? null })) };
  }

  async create(dto: TestimonialInputDto) {
    if (!dto.author || !dto.rating || !dto.body) {
      throw AppError.badRequest('VALIDATION_FAILED', 'Author, rating and body are required.');
    }
    const row = await this.testimonials.save(
      this.testimonials.create({
        author: dto.author,
        location: dto.location ?? null,
        rating: dto.rating,
        body: dto.body,
        productId: dto.productId ?? null,
        isPublished: dto.isPublished ?? false,
        sortOrder: dto.sortOrder ?? 0,
      }),
    );
    return { id: row.id };
  }

  async update(id: number, dto: TestimonialInputDto) {
    const row = await this.testimonials.findOne({ where: { id } });
    if (!row) throw AppError.notFound('Testimonial not found.', 'TESTIMONIAL_NOT_FOUND');
    if (dto.author !== undefined) row.author = dto.author;
    if (dto.location !== undefined) row.location = dto.location;
    if (dto.rating !== undefined) row.rating = dto.rating;
    if (dto.body !== undefined) row.body = dto.body;
    if (dto.productId !== undefined) row.productId = dto.productId;
    if (dto.isPublished !== undefined) row.isPublished = dto.isPublished;
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    await this.testimonials.save(row);
    return { id: row.id };
  }

  async remove(id: number) {
    const result = await this.testimonials.delete({ id });
    if (!result.affected) throw AppError.notFound('Testimonial not found.', 'TESTIMONIAL_NOT_FOUND');
    return { message: 'Testimonial deleted.' };
  }
}

@Injectable()
export class NewsletterService {
  constructor(@InjectRepository(NewsletterSubscriber) private readonly subs: Repository<NewsletterSubscriber>) {}

  /** Idempotent: subscribing twice, or re-subscribing after unsubscribing, both succeed. */
  async subscribe(dto: NewsletterDto) {
    const existing = await this.subs.findOne({ where: { email: dto.email } });
    if (existing) {
      if (existing.status !== 'subscribed') {
        existing.status = 'subscribed';
        await this.subs.save(existing);
      }
      return { status: 'subscribed' as const };
    }
    try {
      await this.subs.save(this.subs.create({ email: dto.email, status: 'subscribed' }));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    return { status: 'subscribed' as const };
  }

  async listAdmin(page: number, limit: number) {
    const [rows, total] = await this.subs.findAndCount({ order: { id: 'DESC' }, skip: (page - 1) * limit, take: limit });
    return paged(rows.map((r) => ({ id: r.id, email: r.email, status: r.status, createdAt: r.createdAt })), page, limit, total);
  }
}
