import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
  };
}

@Injectable()
export class PrintService {
  constructor(private readonly prisma: PrismaService) {}

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
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  /** Fila para o poll do Print Service (ADR-0020) — FIFO. */
  async listByStatus(status: PrintJobStatus): Promise<PrintJobListResponse> {
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
}
