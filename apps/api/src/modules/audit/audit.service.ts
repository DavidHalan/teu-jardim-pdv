import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuditQueryResponse } from '@teu-jardim/shared';
import type { Prisma } from '../../prisma/client';

export interface AuditOptions {
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditQueryFilters {
  eventType?: string;
  userId?: string;
  from?: string; // ISO 8601
  to?: string;
  limit?: number;
  cursor?: string; // id da última entrada da página anterior (opaco p/ o cliente)
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Registro de eventos críticos (RB-043, RB-044). Imutável pela aplicação:
 * só cria, nunca edita/deleta. Chamado por todos os módulos.
 * `db`: passar o tx client quando o comando roda numa transação (audit na tx —
 * api-contracts §2); sem tx, usa a conexão padrão.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    eventType: string,
    opts: AuditOptions = {},
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    await db.auditLog.create({
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

  /**
   * Consulta da trilha (RB-044 — Admin, read-only): entradas de EVENTO, não diff de
   * campos (A-R5). Desc por (createdAt, id); cursor keyset opaco = id da última linha
   * (id desempata createdAt igual — paginação estável sob escrita concorrente).
   */
  async query(filters: AuditQueryFilters = {}): Promise<AuditQueryResponse> {
    const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.eventType ? { eventType: filters.eventType } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, // +1 sonda se há próxima página
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });

    const page = rows.slice(0, limit);
    return {
      entries: page.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        userName: r.user?.name ?? null,
        entityType: r.entityType,
        entityId: r.entityId,
        reason: r.reason,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
