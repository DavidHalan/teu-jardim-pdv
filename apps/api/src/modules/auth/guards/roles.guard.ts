import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@teu-jardim/shared';
import type { JwtPayload } from '@teu-jardim/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    // ADMIN sempre passa (RB-042 acesso total). Compara com o enum do shared, nunca literal.
    if (user && (user.role === Role.ADMIN || required.includes(user.role))) return true;
    throw new ForbiddenException('Permissão insuficiente');
  }
}
