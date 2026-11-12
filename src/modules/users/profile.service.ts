import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AppError } from '../../common/errors';
import { AuthUser } from '../../common/auth/auth.types';
import { Address } from '../../database/entities/address.entity';
import { User } from '../../database/entities/user.entity';
import { toUserView } from '../auth/auth.service';
import { AddressDto, ChangePasswordDto, UpdateProfileDto } from './profile.dto';

export interface AddressView {
  id: number;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

const MAX_ADDRESSES = 10;

function toAddressView(a: Address): AddressView {
  return {
    id: a.id,
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: a.isDefault,
  };
}

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
  ) {}

  async getProfile(user: AuthUser) {
    return toUserView(await this.users.findOneOrFail({ where: { id: user.id } }));
  }

  async updateProfile(user: AuthUser, dto: UpdateProfileDto) {
    const row = await this.users.findOneOrFail({ where: { id: user.id } });
    if (dto.fullName !== undefined) row.fullName = dto.fullName;
    if (dto.phone !== undefined) row.phone = dto.phone ?? null;
    await this.users.save(row);
    return toUserView(row);
  }

  /** Changing the password signs out every existing session, including this one. */
  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const row = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id: user.id })
      .getOneOrFail();
    if (!(await bcrypt.compare(dto.currentPassword, row.passwordHash))) {
      throw AppError.unprocessable('INVALID_PASSWORD', 'Your current password is incorrect.');
    }
    row.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    row.tokenVersion += 1;
    await this.users.save(row);
    return { message: 'Password changed. Sign in again on this device.' };
  }

  async listAddresses(userId: number) {
    const rows = await this.addresses.find({ where: { userId }, order: { isDefault: 'DESC', id: 'ASC' } });
    return { data: rows.map(toAddressView) };
  }

  async createAddress(userId: number, dto: AddressDto) {
    const count = await this.addresses.count({ where: { userId } });
    if (count >= MAX_ADDRESSES) {
      throw AppError.conflict('ADDRESS_LIMIT', `You can save up to ${MAX_ADDRESSES} addresses.`);
    }
    return this.addresses.manager.transaction(async (m) => {
      const repo = m.getRepository(Address);
      const isDefault = dto.isDefault === true || count === 0;
      if (isDefault) await repo.update({ userId }, { isDefault: false });
      const row = repo.create({ ...addressFields(dto), userId, isDefault });
      await repo.save(row);
      return toAddressView(row);
    });
  }

  async updateAddress(userId: number, id: number, dto: AddressDto) {
    return this.addresses.manager.transaction(async (m) => {
      const repo = m.getRepository(Address);
      const row = await repo.findOne({ where: { id, userId } });
      if (!row) throw AppError.notFound('Address not found.', 'ADDRESS_NOT_FOUND');
      if (dto.isDefault === true) await repo.update({ userId }, { isDefault: false });
      Object.assign(row, addressFields(dto));
      if (dto.isDefault !== undefined) row.isDefault = dto.isDefault === true;
      await repo.save(row);
      return toAddressView(row);
    });
  }

  async deleteAddress(userId: number, id: number) {
    const result = await this.addresses.delete({ id, userId });
    if (!result.affected) throw AppError.notFound('Address not found.', 'ADDRESS_NOT_FOUND');
    return { message: 'Address removed.' };
  }
}

function addressFields(dto: AddressDto) {
  return {
    fullName: dto.fullName,
    phone: dto.phone,
    line1: dto.line1,
    line2: dto.line2 ?? null,
    city: dto.city,
    state: dto.state,
    pincode: dto.pincode,
  };
}
