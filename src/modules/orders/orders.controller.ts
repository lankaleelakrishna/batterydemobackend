import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/auth.guard';
import { AuthUser } from '../../common/auth/auth.types';
import { PAYMENT_METHODS, PaymentMethod } from './checkout-policy';
import { OrdersService } from './orders.service';

class PlaceOrderDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  addressId: number;

  @IsIn(PAYMENT_METHODS as readonly string[])
  paymentMethod: PaymentMethod;
}

class OrderListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Price and totals preview. Nothing is written. */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  quote(@CurrentUser() user: AuthUser, @Body() dto: PlaceOrderDto) {
    return this.orders.quote(user, dto);
  }

  @Post()
  place(
    @CurrentUser() user: AuthUser,
    @Body() dto: PlaceOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.orders.place(user, dto, idempotencyKey);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: OrderListQueryDto) {
    return this.orders.list(user.id, q.page ?? 1, q.limit ?? 10);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.orders.detail(user.id, id);
  }
}
