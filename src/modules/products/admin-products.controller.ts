import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard, Roles } from '../../common/auth/auth.guard';
import { AuthUser } from '../../common/auth/auth.types';
import { productImageUpload } from '../../common/uploads';
import {
  AdminProductListQueryDto,
  ComboItemsDto,
  InventoryAdjustmentDto,
  ProductInputDto,
} from './product.dto';
import { ProductAdminService } from './product-admin.service';

class ImageMetaDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  alt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

class MovementsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId?: number;

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

@Controller('admin/products')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminProductsController {
  constructor(private readonly admin: ProductAdminService) {}

  @Get()
  list(@Query() query: AdminProductListQueryDto) {
    return this.admin.list(query);
  }

  @Post()
  create(@Body() dto: ProductInputDto, @CurrentUser() user: AuthUser) {
    return this.admin.create(dto, user.id);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.admin.detail(id);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: ProductInputDto) {
    return this.admin.update(id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.admin.setActive(id, false);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(@Param('id', ParseIntPipe) id: number) {
    return this.admin.setActive(id, true);
  }

  @Put(':id/components')
  components(@Param('id', ParseIntPipe) id: number, @Body() dto: ComboItemsDto) {
    return this.admin.setComponents(id, dto);
  }

  @Post(':id/images')
  @UseInterceptors(FileInterceptor('image', productImageUpload))
  addImage(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() meta: ImageMetaDto,
  ) {
    return this.admin.addImage(id, file, meta.alt, meta.sortOrder);
  }

  @Delete(':id/images/:imageId')
  removeImage(@Param('id', ParseIntPipe) id: number, @Param('imageId', ParseIntPipe) imageId: number) {
    return this.admin.removeImage(id, imageId);
  }

  @Post(':id/inventory-adjustments')
  adjust(@Param('id', ParseIntPipe) id: number, @Body() dto: InventoryAdjustmentDto, @CurrentUser() user: AuthUser) {
    return this.admin.adjustInventory(id, dto, user.id);
  }
}

@Controller('admin/inventory-movements')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminInventoryController {
  constructor(private readonly admin: ProductAdminService) {}

  @Get()
  movements(@Query() query: MovementsQueryDto) {
    return this.admin.movementsFor(query.productId, query.page ?? 1, query.limit ?? 20);
  }
}
