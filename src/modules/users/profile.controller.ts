import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/auth.guard';
import { AuthUser } from '../../common/auth/auth.types';
import { AddressDto, ChangePasswordDto, UpdateProfileDto } from './profile.dto';
import { ProfileService } from './profile.service';

@Controller('me')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.profile.getProfile(user);
  }

  @Put()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profile.updateProfile(user, dto);
  }

  @Put('password')
  password(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.profile.changePassword(user, dto);
  }

  @Get('addresses')
  addresses(@CurrentUser() user: AuthUser) {
    return this.profile.listAddresses(user.id);
  }

  @Post('addresses')
  createAddress(@CurrentUser() user: AuthUser, @Body() dto: AddressDto) {
    return this.profile.createAddress(user.id, dto);
  }

  @Put('addresses/:id')
  updateAddress(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AddressDto) {
    return this.profile.updateAddress(user.id, id, dto);
  }

  @Delete('addresses/:id')
  @HttpCode(HttpStatus.OK)
  deleteAddress(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.profile.deleteAddress(user.id, id);
  }
}
