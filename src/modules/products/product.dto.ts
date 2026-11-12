import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DEFAULT_PAGE_SIZE, MAX_CART_QUANTITY, MAX_PAGE_SIZE, SORT_VALUES, SortValue, KIND_VALUES, TECHNOLOGY_VALUES } from './catalogue-rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const toDate = ({ value }: { value: unknown }) => (value === null || value === undefined || value === '' ? null : new Date(value as string));

/** Query string for GET /products. Multi-value filters are comma-separated. */
export class ProductQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  tech?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  capacity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  price?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(240)
  warranty?: number;

  @IsOptional()
  @IsIn(['0', '1'])
  stock?: '0' | '1';

  @IsOptional()
  @IsIn(SORT_VALUES as readonly string[])
  sort?: SortValue;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  /** Comma-separated product ids, used by the compare and wishlist pages. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  ids?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

export const DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export class SuggestQueryDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

export class SpecInputDto {
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  label: string;

  @Transform(trim)
  @IsString()
  @Length(1, 300)
  value: string;
}

/**
 * Create and update share one shape. On create the service enforces the
 * required fields. On update every field is optional and only given fields change.
 */
export class ProductInputDto {
  @IsOptional()
  @Transform(trim)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug may contain lowercase letters, numbers and hyphens only' })
  @Length(2, 180)
  slug?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  sku?: string | null;

  @IsOptional()
  @IsIn(KIND_VALUES as readonly string[])
  kind?: (typeof KIND_VALUES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  brandId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  modelNumber?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 200)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(240)
  tagline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(TECHNOLOGY_VALUES as readonly string[])
  technology?: (typeof TECHNOLOGY_VALUES)[number] | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  capacityAh?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  ratingVa?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(240)
  warrantyMonths?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  lengthMm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  widthMm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  heightMm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000)
  weightKg?: number | null;

  /** Integer paise. 100 paise = Rs 1. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(100_000_000)
  listPricePaise?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(100_000_000)
  salePricePaise?: number | null;

  @IsOptional()
  @Transform(toDate)
  saleStartsAt?: Date | null;

  @IsOptional()
  @Transform(toDate)
  saleEndsAt?: Date | null;

  @IsOptional()
  @IsBoolean()
  acceptsPreorders?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isBestSeller?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Replaces the full specification list when present. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => SpecInputDto)
  specs?: SpecInputDto[];

  /** Stock recorded as an inventory movement when the product is created. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  initialStock?: number;
}

export class ComboItemInputDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  componentProductId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CART_QUANTITY * 2)
  quantity: number;
}

export class ComboItemsDto {
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ComboItemInputDto)
  items: ComboItemInputDto[];
}

export class InventoryAdjustmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(-100000)
  @Max(100000)
  delta: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class AdminProductListQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['all', 'active', 'archived'])
  status?: 'all' | 'active' | 'archived';

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

export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE };
