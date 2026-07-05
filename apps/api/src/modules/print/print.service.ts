import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PrintJobStatus, TabType } from '@teu-jardim/shared';
import type { AckPrintJobRequest, PrintJobDto, PrintJobListResponse, PrintJobPayload } from '@teu-jardim/shared';
import type { PrintJob as PrintJobRow } from '../../prisma/client';
import { Prisma } from '../../prisma/client';

/** Item roteado de um lançamento — insumo do cupom (snapshot já congelado pelo caller). */
export interface RoutedOrderItem {
  stationId: string;
  name: string;
  quantity: number;
  weightGrams: number | null;
  observations: string[];
}

const EXPIRE_SWEEP_MS = 30_000; // varredura da policy ExpiracaoDeCupom (ADR-0020)

function toDto(j: PrintJobRow): PrintJobDto {
  return {
    id: j.id,
    accountId: j.accountId,
    stationId: j.stationId,
    batchId: j.batchId,
    status: j.status as PrintJobStatus,
    payload: j.payload as unknown as PrintJobPayload,
    error: j.error,
    createdAt: j.createdAt.toISOString(),
    ackedAt: j.ackedAt ? j.ackedAt.toISOString() : null,
    dismissedAt: j.dismissedAt ? j.dismissedAt.toISOString() : null,
  };
}

@Injectable()
export class PrintService implements OnModuleInit, OnModuleDestroy {
  private sweep?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** TTL do cupom (RB-051) — env; default 5 min (decisão dono 2026-07-04). */
  private ttlMs(): number {
    return Number(this.config.get('PRINT_TTL_SECONDS') ?? 300) * 1000;
  }

  onModuleInit(): void {
    // Expiração é policy do SERVIDOR (ADR-0020): roda mesmo com consumer/impressora fora
    // (senão o alerta ao operador nunca dispara). unref: não segura o processo em testes.
    this.sweep = setInterval(() => void this.expireOverdue().catch(() => undefined), EXPIRE_SWEEP_MS);
    this.sweep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }

  /**
   * CupomExpirado (RB-051): QUEUED além do TTL → EXPIRED (nunca imprime; evita preparo
   * duplicado). Auditado por cupom — é o gatilho do alerta ao operador (fallback de voz).
   */
  async expireOverdue(): Promise<void> {
    const cutoff = new Date(Date.now() - this.ttlMs());
    const overdue = await this.prisma.printJob.findMany({
      where: { status: 'QUEUED', createdAt: { lt: cutoff } },
      select: { id: true, placedById: true, payload: true },
    });
    if (overdue.length === 0) return;

    const expired = await this.prisma.printJob.updateMany({
      // reafirma o corte no UPDATE — corrida com ACK do consumer perde para quem chegar primeiro
      where: { id: { in: overdue.map((j) => j.id) }, status: 'QUEUED' },
      data: { status: 'EXPIRED', ackedAt: new Date() },
    });
    if (expired.count === 0) return;

    for (const job of overdue) {
      await this.audit.log('PRINT_JOB_EXPIRED', {
        userId: job.placedById ?? undefined,
        entityType: 'PrintJob',
        entityId: job.id,
        metadata: { payload: job.payload as Prisma.InputJsonValue },
      });
    }
  }

  /**
   * Enfileira cupons de preparo do lançamento (RB-022): 1 PrintJob por estação envolvida,
   * na MESMA tx do placeItems (retry do comando = replay, não re-enfileira; unique parcial
   * uniq_queued_print_job é o backstop — ADR-0015). Payload = snapshot congelado.
   */
  async enqueueForOrder(
    tx: Prisma.TransactionClient,
    args: {
      account: { id: string; tabType: string; number: number };
      batchId: string; // Idempotency-Key do PLACE_ORDER
      placedById: string;
      items: RoutedOrderItem[];
    },
  ): Promise<void> {
    if (args.items.length === 0) return;

    const stationIds = [...new Set(args.items.map((i) => i.stationId))];
    const stations = await tx.station.findMany({ where: { id: { in: stationIds } } });
    const placedBy = await tx.user.findUnique({
      where: { id: args.placedById },
      select: { name: true },
    });
    const placedAt = new Date().toISOString();

    for (const station of stations) {
      const items = args.items.filter((i) => i.stationId === station.id);
      const payload: PrintJobPayload = {
        tabType: args.account.tabType as TabType,
        number: args.account.number,
        stationName: station.name,
        items: items.map(({ name, quantity, weightGrams, observations }) => ({
          name,
          quantity,
          weightGrams,
          observations,
        })),
        placedBy: placedBy?.name ?? 'desconhecido',
        placedAt,
      };
      await tx.printJob.create({
        data: {
          accountId: args.account.id,
          stationId: station.id,
          batchId: args.batchId,
          placedById: args.placedById,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  /** Fila para o poll do Print Service (ADR-0020) — FIFO. Expira os vencidos ANTES de entregar. */
  async listByStatus(status: PrintJobStatus): Promise<PrintJobListResponse> {
    if (status === PrintJobStatus.QUEUED) await this.expireOverdue();
    const rows = await this.prisma.printJob.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
    });
    return { jobs: rows.map(toDto) };
  }

  async getById(id: string): Promise<PrintJobDto> {
    const j = await this.prisma.printJob.findUnique({ where: { id } });
    if (!j) throw new NotFoundException('Cupom não encontrado.');
    return toDto(j);
  }

  /**
   * ACK do Print Service: QUEUED → PRINTED|FAILED. Idempotente por transição
   * (re-reportar o MESMO resultado devolve o job; resultado divergente → 409).
   * Update condicional atômico — sem janela entre check e escrita.
   */
  async ack(id: string, body: AckPrintJobRequest): Promise<PrintJobDto> {
    const updated = await this.prisma.printJob.updateMany({
      where: { id, status: 'QUEUED' },
      data: { status: body.result, error: body.error ?? null, ackedAt: new Date() },
    });
    if (updated.count === 0) {
      const current = await this.getById(id); // 404 se não existe
      if (current.status !== body.result) {
        throw new ConflictException(`Cupom já está ${current.status}; transição inválida.`);
      }
    }
    return this.getById(id);
  }

  /** Alertas do operador (RB-051: direcionado a quem lançou): EXPIRED/FAILED sem ciência. */
  async listAlertsFor(userId: string): Promise<PrintJobListResponse> {
    await this.expireOverdue(); // banner não espera a varredura
    const rows = await this.prisma.printJob.findMany({
      where: { placedById: userId, status: { in: ['EXPIRED', 'FAILED'] }, dismissedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { jobs: rows.map(toDto) };
  }

  /** Ciência do alerta — só o autor dispensa; registra que o fallback de voz foi acionado. */
  async dismiss(id: string, userId: string): Promise<PrintJobDto> {
    const updated = await this.prisma.printJob.updateMany({
      where: { id, placedById: userId, status: { in: ['EXPIRED', 'FAILED'] }, dismissedAt: null },
      data: { dismissedAt: new Date() },
    });
    if (updated.count === 0) throw new NotFoundException('Alerta não encontrado.');

    await this.audit.log('PRINT_ALERT_DISMISSED', {
      userId,
      entityType: 'PrintJob',
      entityId: id,
    });
    return this.getById(id);
  }
}
