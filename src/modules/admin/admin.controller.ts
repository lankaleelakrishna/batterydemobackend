import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard, Roles } from '../../common/auth/auth.guard';
import { AuthUser } from '../../common/auth/auth.types';
import { ORDER_STATUSES, OrderStatusValue, PAYMENT_STATUSES, PaymentStatusValue } from '../../database/entities/order.entity';
import { AdminService } from './admin.service';

class PageDto {
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

class CustomerQueryDto extends PageDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().slice(0, 100) : value))
  @IsString()
  search?: string;
}

class OrderQueryDto extends PageDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES as readonly string[])
  status?: OrderStatusValue;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}

class UpdateOrderDto {
  @IsOptional()
  @IsIn(ORDER_STATUSES as readonly string[])
  status?: OrderStatusValue;

  @IsOptional()
  @IsIn(PAYMENT_STATUSES as readonly string[])
  paymentStatus?: PaymentStatusValue;
}

class UpdateCustomerDto {
  @IsBoolean()
  isActive: boolean;
}

/** Admin-only operations: dashboard, customers and orders. Products, brands, categories and content have their own admin controllers. */
@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('customers')
  customers(@Query() q: CustomerQueryDto) {
    return this.admin.listCustomers(q.search, q.page ?? 1, q.limit ?? 20);
  }

  @Patch('customers/:id')
  setCustomer(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto) {
    return this.admin.setCustomerActive(actor, id, dto.isActive);
  }

  @Get('orders')
  orders(@Query() q: OrderQueryDto) {
    return this.admin.listOrders({ status: q.status, from: q.from, to: q.to, page: q.page ?? 1, limit: q.limit ?? 20 });
  }

  @Get('orders/:id')
  order(@Param('id', ParseIntPipe) id: number) {
    return this.admin.orderDetail(id);
  }

  @Patch('orders/:id')
  updateOrder(@CurrentUser() actor: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderDto) {
    return this.admin.updateOrder(actor, id, dto);
  }
}
