import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, Max, Min, ValidateNested } from 'class-validator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/auth.guard';
import { AuthUser } from '../../common/auth/auth.types';
import { MAX_CART_QUANTITY } from '../products/catalogue-rules';
import { CartService } from './cart.service';

class SetQuantityDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CART_QUANTITY)
  quantity: number;
}

class GuestLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  productId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CART_QUANTITY)
  quantity: number;
}

class MergeCartDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GuestLineDto)
  items: GuestLineDto[];
}

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.cart.view(user.id);
  }

  @Put('items/:productId')
  set(@CurrentUser() user: AuthUser, @Param('productId', ParseIntPipe) productId: number, @Body() dto: SetQuantityDto) {
    return this.cart.setQuantity(user.id, productId, dto.quantity);
  }

  @Delete('items/:productId')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthUser, @Param('productId', ParseIntPipe) productId: number) {
    return this.cart.remove(user.id, productId);
  }

  /** Called once after sign-in with the guest cart from localStorage. */
  @Post('merge')
  merge(@CurrentUser() user: AuthUser, @Body() dto: MergeCartDto) {
    return this.cart.merge(user.id, dto.items);
  }
}
