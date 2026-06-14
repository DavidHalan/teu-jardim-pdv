import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { LoginRequest, LoginResponse, JwtPayload, AuthUser, Role } from '@teu-jardim/shared';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginRequest): Promise<LoginResponse> {
    const user = await this.users.findActiveByUsername(dto.username);
    // Compara mesmo sem usuário só não é necessário aqui; resposta uniforme via exceção única.
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Cast na borda: user.role é o enum-união do Prisma; JwtPayload/AuthUser usam o enum nominal do shared.
    const payload: JwtPayload = { sub: user.id, name: user.name, role: user.role as Role };
    const accessToken = await this.jwt.signAsync(payload);
    await this.audit.log('AUTH_LOGIN', { userId: user.id, entityType: 'User', entityId: user.id });

    const authUser: AuthUser = { id: user.id, name: user.name, role: user.role as Role };
    return { accessToken, user: authUser };
  }
}
