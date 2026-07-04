import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { PRINT_SERVICE_KEY_HEADER } from '@teu-jardim/shared';

/**
 * Autentica o apps/print-service (cliente headless no mesmo host): chave estática
 * compartilhada via env (RB-060b — segredo nunca no código). Env ausente = rotas
 * do consumer fechadas (nega tudo; fail-safe).
 */
@Injectable()
export class PrintServiceKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('PRINT_SERVICE_API_KEY');
    const given = context.switchToHttp().getRequest<Request>().header(PRINT_SERVICE_KEY_HEADER);
    if (!expected || !given) throw new UnauthorizedException();

    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return true;
  }
}
