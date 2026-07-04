import { BadRequestException, createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { IDEMPOTENCY_KEY_HEADER } from '@teu-jardim/shared';
import type { Request } from 'express';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Header obrigatório em mutação financeira (Constituição §26.4; ADR-0026 §6).
 * Ausente ou não-UUID → 400 (validação, não conflito).
 */
export const IdempotencyKeyHeader = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const key = req.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()];
    if (typeof key !== 'string' || !UUID_RE.test(key)) {
      throw new BadRequestException(
        `Header ${IDEMPOTENCY_KEY_HEADER} (UUID por intenção) é obrigatório neste comando.`,
      );
    }
    return key;
  },
);
