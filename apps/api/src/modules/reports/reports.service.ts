import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenClosedStatus, PaymentMethod, Role } from '@teu-jardim/shared';
import type {
  ClosingReport,
  ExceptionRow,
  ExceptionsReport,
  ReportKind,
  SalesByMethodReport,
  SalesByProductReport,
  TicketReport,
} from '@teu-jardim/shared';
import type { BusinessSession as SessionRow } from '../../prisma/client';
import { Prisma } from '../../prisma/client';
import { expectedCash, cashDifference } from '../registers/register-math';

const KINDS: ReportKind[] = ['closing', 'sales-by-method', 'sales-by-product', 'exceptions', 'ticket'];
const EXCEPTION_EVENTS = ['ITEM_CANCELED', 'ACCOUNT_CANCEL', 'DISCOUNT_APPLIED', 'PAYMENT_REVERSED'] as const;

const D = (v: Prisma.Decimal | number | null | undefined) =>
  new Prisma.Decimal(v ?? 0).toDecimalPlaces(2);

/**
 * Relatórios (RB-053): 5 projeções query-time sobre o estado (Fase 08 §12 — sem
 * materialização). "Vendas" = contas efetivamente PAGAS (payments SETTLED) — conta
 * estornada volta a OPEN e sai do relatório até ser recobrada. Exceções vêm do
 * AuditLog, escopadas pela JANELA TEMPORAL da operação (audit não referencia sessão).
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** RB-053a: Caixa vê só fechamento; Admin tudo (RolesGuard já barra Funcionário). */
  async get(kind: string, role: Role, businessSessionId?: string): Promise<unknown> {
    if (!KINDS.includes(kind as ReportKind)) {
      throw new BadRequestException(`Relatório desconhecido: ${kind}.`);
    }
    if (role !== Role.ADMIN && kind !== 'closing') {
      throw new ForbiddenException('Este relatório é do Administrador (RB-053a).');
    }

    const session = await this.resolveSession(businessSessionId);
    switch (kind as ReportKind) {
      case 'closing':
        return this.closing(session);
      case 'sales-by-method':
        return this.salesByMethod(session);
      case 'sales-by-product':
        return this.salesByProduct(session);
      case 'exceptions':
        return this.exceptions(session);
      case 'ticket':
        return this.ticket(session);
    }
  }

  /** Sem id → operação OPEN corrente; com id → qualquer operação (relatório pós-encerramento). */
  private async resolveSession(id?: string): Promise<SessionRow> {
    if (id) {
      const s = await this.prisma.businessSession.findUnique({ where: { id } });
      if (!s) throw new NotFoundException('Operação não encontrada.');
      return s;
    }
    const current = await this.prisma.businessSession.findFirst({ where: { status: 'OPEN' } });
    if (!current) {
      throw new ConflictException('Nenhuma operação aberta — informe businessSessionId.');
    }
    return current;
  }

  private async closing(session: SessionRow): Promise<ClosingReport> {
    const registers = await this.prisma.register.findMany({
      where: { businessSessionId: session.id },
      include: { operator: { select: { name: true } } },
      orderBy: { openedAt: 'asc' },
    });
    const sums = await this.prisma.cashMovement.groupBy({
      by: ['registerId', 'type'],
      where: { register: { businessSessionId: session.id } },
      _sum: { amount: true },
    });
    const sumOf = (registerId: string, type: string) =>
      D(sums.find((s) => s.registerId === registerId && s.type === type)?._sum.amount);

    return {
      businessSessionId: session.id,
      registers: registers.map((r) => {
        const receipts = sumOf(r.id, 'SALE_RECEIPT');
        const supplies = sumOf(r.id, 'SUPPLY');
        const withdrawals = sumOf(r.id, 'WITHDRAWAL');
        const reversals = sumOf(r.id, 'PAYMENT_REVERSAL');
        // CLOSED: figuras congeladas do fechamento (snapshot, I-3); OPEN: esperado corrente.
        const expected = r.expectedAmount ?? expectedCash(r.openingAmount, receipts, supplies, withdrawals, reversals);
        return {
          registerId: r.id,
          operatorName: r.operator.name,
          status: r.status as OpenClosedStatus,
          openingAmount: r.openingAmount.toFixed(2),
          cashReceipts: receipts.toFixed(2),
          cashSupplies: supplies.toFixed(2),
          cashWithdrawals: withdrawals.toFixed(2),
          cashReversals: reversals.toFixed(2),
          expectedAmount: expected.toFixed(2),
          countedAmount: r.countedAmount ? r.countedAmount.toFixed(2) : null,
          difference: r.countedAmount ? cashDifference(r.countedAmount, expected).toFixed(2) : null,
        };
      }),
    };
  }

  private async salesByMethod(session: SessionRow): Promise<SalesByMethodReport> {
    const rows = await this.prisma.paymentTender.groupBy({
      by: ['method'],
      where: { payment: { status: 'SETTLED', accountGroup: { businessSessionId: session.id } } },
      _sum: { amount: true },
    });
    const mapped = rows
      .map((r) => ({ method: r.method as PaymentMethod, total: D(r._sum.amount) }))
      .sort((a, b) => a.method.localeCompare(b.method));
    const total = mapped.reduce((acc, r) => acc.add(r.total), new Prisma.Decimal(0));
    return {
      businessSessionId: session.id,
      rows: mapped.map((r) => ({ method: r.method, total: r.total.toFixed(2) })),
      total: total.toDecimalPlaces(2).toFixed(2),
    };
  }

  private async salesByProduct(session: SessionRow): Promise<SalesByProductReport> {
    const grouped = await this.prisma.accountItem.groupBy({
      by: ['productId'],
      where: {
        account: { businessSessionId: session.id, status: 'PAID' },
        NOT: { kdsStatus: 'CANCELED' },
      },
      _sum: { quantity: true, weightGrams: true, lineTotal: true },
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      include: { category: { select: { name: true } } },
    });
    return {
      businessSessionId: session.id,
      rows: grouped
        .map((g) => {
          const p = products.find((x) => x.id === g.productId);
          return {
            productId: g.productId,
            productName: p?.name ?? 'desconhecido',
            categoryName: p?.category.name ?? '—',
            quantity: p?.type === 'WEIGHED' ? 0 : (g._sum.quantity ?? 0),
            weightGrams: g._sum.weightGrams ?? 0,
            total: D(g._sum.lineTotal),
          };
        })
        .sort((a, b) => b.total.comparedTo(a.total))
        .map((r) => ({ ...r, total: r.total.toFixed(2) })),
    };
  }

  private async exceptions(session: SessionRow): Promise<ExceptionsReport> {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        eventType: { in: [...EXCEPTION_EVENTS] },
        createdAt: { gte: session.openedAt, ...(session.closedAt ? { lte: session.closedAt } : {}) },
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' }, // contrato §11: por hora
    });
    return {
      businessSessionId: session.id,
      rows: rows.map((r): ExceptionRow => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const money = meta['lineTotal'] ?? meta['total'] ?? meta['cashReturned'] ?? meta['value'];
        return {
          at: r.createdAt.toISOString(),
          type: r.eventType as ExceptionRow['type'],
          operatorName: r.user?.name ?? 'desconhecido',
          reason: r.reason,
          detail: money !== undefined ? String(money) : null,
        };
      }),
    };
  }

  private async ticket(session: SessionRow): Promise<TicketReport> {
    const agg = await this.prisma.account.aggregate({
      where: { businessSessionId: session.id, status: 'PAID' },
      _count: { id: true },
      _sum: { total: true },
    });
    const count = agg._count.id;
    const revenue = D(agg._sum.total);
    const average = count > 0 ? revenue.div(count).toDecimalPlaces(2) : new Prisma.Decimal(0);
    return {
      businessSessionId: session.id,
      accountCount: count,
      revenue: revenue.toFixed(2),
      average: average.toFixed(2),
    };
  }
}
