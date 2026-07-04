import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { LoginRequest, LoginResponse, JwtPayload, AuthUser, Role } from '@teu-jardim/shared';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

// Anti-brute-force (ADR-0022 §2, RB-060a; parâmetros: decisão do dono 2026-07-03).
// Estado derivado do próprio AuditLog (imutável, sobrevive a restart) — sem tabela nova.
export const LOCKOUT_MAX_FAILURES = 5; // por usuário na janela (zera no login com sucesso)
export const LOCKOUT_MAX_PER_ORIGIN = 20; // por origem na janela (pega rotação de usuário)
export const LOCKOUT_WINDOW_MINUTES = 15;

const LOCKOUT_MESSAGE = 'Muitas tentativas de login. Aguarde alguns minutos.'; // genérica (RB-060d)

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async login(dto: LoginRequest, origin: string): Promise<LoginResponse> {
    await this.assertNotLockedOut(dto.username, origin);

    const user = await this.users.findActiveByUsername(dto.username);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      // RB-059: falha auditada (usuário TENTADO + origem) — nunca a senha.
      await this.audit.log('LOGIN_FAILED', {
        entityType: 'User',
        entityId: user?.id,
        metadata: { username: dto.username, origin },
      });
      throw new UnauthorizedException('Credenciais inválidas'); // não revela se o usuário existe
    }

    // Cast na borda: user.role é o enum-união do Prisma; JwtPayload/AuthUser usam o enum nominal do shared.
    const payload: JwtPayload = { sub: user.id, name: user.name, role: user.role as Role };
    const accessToken = await this.jwt.signAsync(payload);
    await this.audit.log('AUTH_LOGIN', {
      userId: user.id,
      entityType: 'User',
      entityId: user.id,
      metadata: { username: dto.username, origin },
    });

    const authUser: AuthUser = { id: user.id, name: user.name, role: user.role as Role };
    return { accessToken, user: authUser };
  }

  /**
   * Lockout temporário (RB-060a): ≥5 falhas do usuário desde o último sucesso (na janela)
   * ou ≥20 falhas da mesma origem na janela → 429. Desbloqueio = janela expirar
   * (sem endpoint Admin no MVP — pendência registrada no backlog).
   */
  private async assertNotLockedOut(username: string, origin: string): Promise<void> {
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * 60_000);

    const lastSuccess = await this.prisma.auditLog.findFirst({
      where: {
        eventType: 'AUTH_LOGIN',
        createdAt: { gt: since },
        metadata: { path: ['username'], equals: username },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const userSince = lastSuccess ? lastSuccess.createdAt : since;

    const userFailures = await this.prisma.auditLog.count({
      where: {
        eventType: 'LOGIN_FAILED',
        createdAt: { gt: userSince },
        metadata: { path: ['username'], equals: username },
      },
    });
    if (userFailures >= LOCKOUT_MAX_FAILURES) {
      throw new HttpException(LOCKOUT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }

    const originFailures = await this.prisma.auditLog.count({
      where: {
        eventType: 'LOGIN_FAILED',
        createdAt: { gt: since },
        metadata: { path: ['origin'], equals: origin },
      },
    });
    if (originFailures >= LOCKOUT_MAX_PER_ORIGIN) {
      throw new HttpException(LOCKOUT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
