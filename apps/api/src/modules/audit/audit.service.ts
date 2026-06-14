import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditOptions {
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Registro de eventos críticos (RB-043, RB-044). Imutável pela aplicação:
 * só cria, nunca edita/deleta. Chamado por todos os módulos.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(eventType: string, opts: AuditOptions = {}): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        eventType,
        userId: opts.userId ?? undefined,
        entityType: opts.entityType,
        entityId: opts.entityId,
        reason: opts.reason,
        metadata: opts.metadata as object | undefined,
      },
    });
  }
}
