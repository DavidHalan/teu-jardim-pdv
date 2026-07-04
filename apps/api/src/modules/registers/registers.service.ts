import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BusinessSessionsService } from '../business-sessions/business-sessions.service';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import { CashMovementType, OpenClosedStatus } from '@teu-jardim/shared';
import type {
  CashMovementDto,
  RegisterCloseSummary,
  RegisterClosedDto,
  RegisterDto,
  RegisterMovementsResponse,
} from '@teu-jardim/shared';
import type { Register as RegisterRow } from '../../prisma/client';
import { Prisma } from '../../prisma/client';
import { expectedCash, cashDifference } from './register-math';

function toDto(r: RegisterRow): RegisterDto {
  return {
    id: r.id,
    businessSessionId: r.businessSessionId,
    operatorId: r.operatorId,
    openingAmount: r.openingAmount.toFixed(2), // Decimal→string canônica, sem float (RB-047)
    status: r.status as OpenClosedStatus,
    openedAt: r.openedAt.toISOString(),
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
  };
}

@Injectable()
export class RegistersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: BusinessSessionsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Caixa OPEN do operador na operação corrente (ou null). Operator-scoped (PRD: 2 caixas). */
  async getCurrentForOperator(operatorId: string): Promise<RegisterDto | null> {
    const session = await this.prisma.businessSession.findFirst({ where: { status: 'OPEN' } });
    if (!session) return null;
    const r = await this.prisma.register.findFirst({
      where: { businessSessionId: session.id, operatorId, status: 'OPEN' },
    });
    return r ? toDto(r) : null;
  }

  /** Abre o caixa do operador (RB-009). Exige operação OPEN (RB-008). ≤1 caixa OPEN por operador (RB-009a). */
  async openRegister(openingAmount: string, operatorId: string): Promise<RegisterDto> {
    if (Number(openingAmount) < 0) {
      throw new BadRequestException('Valor inicial não pode ser negativo.');
    }
    const session = await this.sessions.getCurrentRowOrThrow(); // RB-008
    const existing = await this.prisma.register.findFirst({
      where: { businessSessionId: session.id, operatorId, status: 'OPEN' },
    });
    if (existing) throw new ConflictException('Você já tem um caixa aberto nesta operação.');

    const r = await this.prisma.register.create({
      data: { businessSessionId: session.id, operatorId, openingAmount },
    });
    await this.audit.log('REGISTER_OPEN', {
      userId: operatorId, entityType: 'Register', entityId: r.id, metadata: { openingAmount },
    });
    return toDto(r);
  }

  /** Caixa OPEN do operador na operação corrente (linha Prisma) ou 409. */
  async getCurrentRowForOperatorOrThrow(operatorId: string): Promise<RegisterRow> {
    const session = await this.prisma.businessSession.findFirst({ where: { status: 'OPEN' } });
    if (!session) throw new ConflictException('Nenhuma operação aberta.');
    const r = await this.prisma.register.findFirst({
      where: { businessSessionId: session.id, operatorId, status: 'OPEN' },
    });
    if (!r) throw new ConflictException('Você não tem um caixa aberto.');
    return r;
  }

  /** Σ por tipo de movimentação do caixa (RB-010/049) — uma query, zeros p/ tipos ausentes. */
  private async cashTotals(
    registerId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<{
    receipts: Prisma.Decimal;
    supplies: Prisma.Decimal;
    withdrawals: Prisma.Decimal;
    reversals: Prisma.Decimal;
  }> {
    const rows = await db.cashMovement.groupBy({
      by: ['type'],
      where: { registerId },
      _sum: { amount: true },
    });
    const sum = (type: string) =>
      new Prisma.Decimal(rows.find((r) => r.type === type)?._sum.amount ?? 0).toDecimalPlaces(2);
    return {
      receipts: sum('SALE_RECEIPT'),
      supplies: sum('SUPPLY'),
      withdrawals: sum('WITHDRAWAL'),
      reversals: sum('PAYMENT_REVERSAL'),
    };
  }

  /** Conta as contas OPEN da operação (RB-012/012a). */
  private async openAccountCount(businessSessionId: string): Promise<number> {
    return this.prisma.account.count({ where: { businessSessionId, status: 'OPEN' } });
  }

  /** Prévia do fechamento (RB-011/052): esperado + se há conta aberta bloqueando. */
  async getCloseSummary(operatorId: string): Promise<RegisterCloseSummary> {
    const register = await this.getCurrentRowForOperatorOrThrow(operatorId);
    const totals = await this.cashTotals(register.id);
    const expectedAmount = expectedCash(
      register.openingAmount,
      totals.receipts,
      totals.supplies,
      totals.withdrawals,
      totals.reversals,
    );
    const openAccountCount = await this.openAccountCount(register.businessSessionId);
    return {
      registerId: register.id,
      openingAmount: register.openingAmount.toFixed(2),
      cashReceipts: totals.receipts.toFixed(2),
      cashSupplies: totals.supplies.toFixed(2),
      cashWithdrawals: totals.withdrawals.toFixed(2),
      cashReversals: totals.reversals.toFixed(2),
      expectedAmount: expectedAmount.toFixed(2),
      openAccountCount,
    };
  }

  /**
   * Sangria/Suprimento (RB-010/052): só Caixa com caixa OPEN; valor > 0 e motivo
   * obrigatórios; auditado na tx; idempotente. Sem teto — risco aceito (dono, 2026-06-19).
   */
  private async addCashMovement(
    type: 'WITHDRAWAL' | 'SUPPLY',
    operatorId: string,
    amount: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<CashMovementDto> {
    const value = new Prisma.Decimal(amount);
    if (value.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Valor deve ser maior que zero (RB-052).');
    }

    const command = type === 'WITHDRAWAL' ? 'CASH_WITHDRAWAL' : 'CASH_SUPPLY';
    return this.idempotency.execute<CashMovementDto>({
      command,
      key: idempotencyKey,
      request: { operatorId, amount, reason },
      run: async (tx) => {
        const session = await tx.businessSession.findFirst({ where: { status: 'OPEN' } });
        if (!session) throw new ConflictException('Nenhuma operação aberta.');
        const register = await tx.register.findFirst({
          where: { businessSessionId: session.id, operatorId, status: 'OPEN' },
        });
        if (!register) throw new ConflictException('Você não tem um caixa aberto.');

        const movement = await tx.cashMovement.create({
          data: {
            registerId: register.id,
            type,
            amount: value.toDecimalPlaces(2),
            reason,
            userId: operatorId,
          },
        });

        await this.audit.log(
          command, // CASH_WITHDRAWAL | CASH_SUPPLY (Sangria/SuprimentoRegistrado)
          {
            userId: operatorId,
            entityType: 'CashMovement',
            entityId: movement.id,
            reason,
            metadata: { registerId: register.id, amount: movement.amount.toFixed(2) },
          },
          tx,
        );

        return {
          id: movement.id,
          type: movement.type as CashMovementType,
          amount: movement.amount.toFixed(2),
          reason: movement.reason,
          createdAt: movement.createdAt.toISOString(),
        };
      },
    });
  }

  registerWithdrawal(operatorId: string, amount: string, reason: string, idempotencyKey: string): Promise<CashMovementDto> {
    return this.addCashMovement('WITHDRAWAL', operatorId, amount, reason, idempotencyKey);
  }

  registerSupply(operatorId: string, amount: string, reason: string, idempotencyKey: string): Promise<CashMovementDto> {
    return this.addCashMovement('SUPPLY', operatorId, amount, reason, idempotencyKey);
  }

  /** Movimentações do caixa OPEN do operador — todos os tipos, mais recente primeiro. */
  async listMovements(operatorId: string): Promise<RegisterMovementsResponse> {
    const register = await this.getCurrentRowForOperatorOrThrow(operatorId);
    const rows = await this.prisma.cashMovement.findMany({
      where: { registerId: register.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      movements: rows.map((m) => ({
        id: m.id,
        type: m.type as CashMovementType,
        amount: m.amount.toFixed(2),
        reason: m.reason,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Fecha o caixa (RB-011/012/012a). Bloqueado se houver conta OPEN na operação.
   * Idempotente por Idempotency-Key (ADR-0019): retry devolve o fechamento original.
   */
  async closeRegister(
    operatorId: string,
    countedAmount: string,
    idempotencyKey: string,
  ): Promise<RegisterClosedDto> {
    return this.idempotency.execute<RegisterClosedDto>({
      command: 'CLOSE_REGISTER',
      key: idempotencyKey,
      request: { operatorId, countedAmount },
      run: async (tx) => {
        const session = await tx.businessSession.findFirst({ where: { status: 'OPEN' } });
        if (!session) throw new ConflictException('Nenhuma operação aberta.');
        const register = await tx.register.findFirst({
          where: { businessSessionId: session.id, operatorId, status: 'OPEN' },
        });
        if (!register) throw new ConflictException('Você não tem um caixa aberto.');

        const open = await tx.account.count({ where: { businessSessionId: session.id, status: 'OPEN' } });
        if (open > 0) {
          throw new ConflictException('Há conta(s) aberta(s) na operação. Pague ou cancele antes de fechar o caixa.');
        }

        const totals = await this.cashTotals(register.id, tx);
        const expectedAmount = expectedCash(
          register.openingAmount,
          totals.receipts,
          totals.supplies,
          totals.withdrawals,
          totals.reversals,
        );
        const counted = new Prisma.Decimal(countedAmount).toDecimalPlaces(2);
        const difference = cashDifference(counted, expectedAmount);

        const closed: RegisterRow = await tx.register.update({
          where: { id: register.id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            expectedAmount,
            countedAmount: counted,
            difference,
          },
        });

        await this.audit.log(
          'REGISTER_CLOSE',
          {
            userId: operatorId,
            entityType: 'Register',
            entityId: closed.id,
            metadata: {
              expectedAmount: closed.expectedAmount?.toFixed(2),
              countedAmount: closed.countedAmount?.toFixed(2),
              difference: closed.difference?.toFixed(2),
            },
          },
          tx,
        );

        return {
          id: closed.id,
          status: closed.status as RegisterClosedDto['status'],
          openingAmount: closed.openingAmount.toFixed(2),
          expectedAmount: closed.expectedAmount!.toFixed(2),
          countedAmount: closed.countedAmount!.toFixed(2),
          difference: closed.difference!.toFixed(2),
          closedAt: closed.closedAt!.toISOString(),
        };
      },
    });
  }
}
