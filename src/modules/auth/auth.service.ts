import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { AppEnv } from '../../config/env';
import { AppError } from '../../common/errors';
import { JwtClaims, AuthUser } from '../../common/auth/auth.types';
import { User } from '../../database/entities/user.entity';
import { LoginDto, RegisterDto } from './auth.dto';

const BCRYPT_ROUNDS = 12;
/** Used to spend the same time on unknown emails as on real ones, so response timing does not reveal accounts. */
const DUMMY_HASH = bcrypt.hashSync('volten-timing-placeholder', BCRYPT_ROUNDS);

export interface UserView {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: 'customer' | 'admin';
}

export function toUserView(u: Pick<User, 'id' | 'email' | 'fullName' | 'phone' | 'role'>): UserView {
  return { id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, role: u.role };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.users.exists({ where: { email: dto.email } });
    if (exists) {
      throw AppError.conflict('EMAIL_TAKEN', 'An account with this email already exists. Try signing in.');
    }
    const user = this.users.create({
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone ?? null,
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      role: 'customer',
      isActive: true,
      tokenVersion: 0,
    });
    try {
      await this.users.save(user);
    } catch (err) {
      // Two registrations with the same email can race past the check above.
      if (isUniqueViolation(err)) throw AppError.conflict('EMAIL_TAKEN', 'An account with this email already exists. Try signing in.');
      throw err;
    }
    return this.issue(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: dto.email })
      .getOne();
    // The same message for unknown email, wrong password and inactive account, so accounts cannot be enumerated.
    const invalid = () => AppError.unprocessable('INVALID_CREDENTIALS', 'Email or password is incorrect.');
    if (!user) {
      // Spend comparable time even when the user does not exist.
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw invalid();
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok || !user.isActive) throw invalid();
    return this.issue(user);
  }

  /** Revokes every token issued to this user by bumping the token version. */
  async logout(userId: number) {
    await this.users.increment({ id: userId }, 'tokenVersion', 1);
    return { message: 'Signed out.' };
  }

  async me(user: AuthUser) {
    const row = await this.users.findOneOrFail({ where: { id: user.id } });
    return toUserView(row);
  }

  private async issue(user: User) {
    const app = this.config.get<AppEnv>('app')!;
    const claims: JwtClaims = { sub: String(user.id), role: user.role, tv: user.tokenVersion };
    const token = await this.jwt.signAsync(claims, {
      secret: app.jwt.secret,
      expiresIn: app.jwt.expiresIn,
      issuer: app.jwt.issuer,
      audience: app.jwt.audience,
    });
    return { token, user: toUserView(user) };
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
