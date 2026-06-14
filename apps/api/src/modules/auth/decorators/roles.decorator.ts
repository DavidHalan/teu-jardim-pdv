import { SetMetadata } from '@nestjs/common';
import type { Role } from '@teu-jardim/shared';

export const ROLES_KEY = 'roles';
/** Exige um dos perfis informados (RB-040..042). Sem este decorator → só exige autenticação. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
