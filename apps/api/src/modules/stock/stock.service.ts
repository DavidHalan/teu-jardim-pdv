import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StockMovementType } from '@teu-jardim/shared';
import type { StockBalanceResponse, StockMovementDto } from '@teu-jardim/shared';
import { Prisma } from '../../prisma/client';

/**
 * Estoque simples (RB-045/046): saldo = Σ movimentos (IN soma, OUT subtrai, ADJUST é
 * assinado), derivado query-time — nenhuma coluna de saldo, nenhuma baixa por venda.
 * Movimentos só pelo Administrador (RB-054, no controller); ajuste exige motivo; auditado.
 */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Produtos ativos com saldo derivado (0 sem movimento) — ordem alfabética. */
  async balances(): Promise<StockBalanceResponse> {
    const products = await this.prisma.product.findMany({
      where: { active: true },
      include: { category: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const sums = await this.prisma.stockMovement.groupBy({
      by: ['productId', 'type'],
      _sum: { quantity: true },
    });
    const sumOf = (productId: string, type: string) =>
      new Prisma.Decimal(sums.find((s) => s.productId === productId && s.type === type)?._sum.quantity ?? 0);

    return {
      rows: products.map((p) => {
        const balance = sumOf(p.id, 'IN').sub(sumOf(p.id, 'OUT')).add(sumOf(p.id, 'ADJUST'));
        return {
          productId: p.id,
          productName: p.name,
          categoryName: p.category.name,
          balance: balance.toDecimalPlaces(3).toString(),
        };
      }),
    };
  }

  /** Registra movimento (RB-045/054): IN/OUT > 0; ADJUST assinado ≠ 0 e com motivo. */
  async registerMovement(
    productId: string,
    type: StockMovementType,
    quantity: string,
    userId: string,
    reason?: string,
  ): Promise<StockMovementDto> {
    const qty = new Prisma.Decimal(quantity).toDecimalPlaces(3);
    if (type === StockMovementType.ADJUST) {
      if (qty.isZero()) throw new BadRequestException('Ajuste não pode ser zero.');
      if (!reason?.trim()) throw new BadRequestException('Ajuste exige motivo (RB-054).');
    } else if (qty.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Quantidade deve ser maior que zero.');
    }

    const movement = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new NotFoundException('Produto não encontrado.');

      const created = await tx.stockMovement.create({
        data: { productId, type, quantity: qty, reason: reason?.trim() || undefined, userId },
      });
      await this.audit.log(
        'STOCK_MOVEMENT',
        {
          userId,
          entityType: 'StockMovement',
          entityId: created.id,
          reason: reason?.trim() || undefined,
          metadata: { productId, productName: product.name, type, quantity: qty.toString() },
        },
        tx,
      );
      return created;
    });

    return {
      id: movement.id,
      productId: movement.productId,
      type: movement.type as StockMovementType,
      quantity: movement.quantity.toString(),
      reason: movement.reason,
      createdAt: movement.createdAt.toISOString(),
    };
  }
}
