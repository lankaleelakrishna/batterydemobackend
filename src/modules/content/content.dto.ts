import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class ReviewInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  title?: string;

  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  body: string;
}

export class ReviewModerationDto {
  @IsIn(['pending', 'approved', 'rejected'])
  status: 'pending' | 'approved' | 'rejected';
}

export class TestimonialInputDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 120)
  author?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  location?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(10, 1000)
  body?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number | null;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;
}

export class NewsletterDto {
  @Transform(lower)
  @IsEmail({}, { message: 'Enter an email address like name@example.com.' })
  @MaxLength(255)
  email: string;
}
