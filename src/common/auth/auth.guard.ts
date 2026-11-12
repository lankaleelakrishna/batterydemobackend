import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { AppEnv } from '../../config/env';
import { AuthUser, JwtClaims, UserRole } from './auth.types';

export const ROLES_KEY = 'roles';
/** Restricts a route to the listed roles. Must be used together with JwtAuthGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

type AuthRequest = Request & { user?: AuthUser };

/**
 * Verifies a `Authorization: Bearer <jwt>` header, checks the signature,
 * issuer, audience and expiry, then loads the user. Tokens are rejected when
 * the user is inactive or the token version has changed (logout or
 * deactivation), so revoking access takes effect immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const header = req.headers['authorization'];
    if (!header || Array.isArray(header) || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Sign in to continue.' });
    }
    const token = header.slice(7).trim();
    const app = this.config.get<AppEnv>('app')!;

    let claims: JwtClaims;
    try {
      claims = await this.jwt.verifyAsync<JwtClaims>(token, {
        secret: app.jwt.secret,
        issuer: app.jwt.issuer,
        audience: app.jwt.audience,
      });
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Your session has expired. Sign in again.' });
    }

    const user = await this.users.findOne({ where: { id: Number(claims.sub) } });
    if (!user || !user.isActive || user.tokenVersion !== claims.tv) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Your session has expired. Sign in again.' });
    }

    req.user = { id: user.id, role: user.role, email: user.email, fullName: user.fullName };

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && roles.length && !roles.includes(user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You do not have permission for this action.' });
    }
    return true;
  }
}
