import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BusinessSessionsService } from '../business-sessions/business-sessions.service';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import { OpenClosedStatus } from '@teu-jardim/shared';
import type { RegisterDto, RegisterCloseSummary, RegisterClosedDto } from '@teu-jardim/shared';
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

  /** Σ recebimentos em dinheiro do caixa (SALE_RECEIPT). */
  private async cashReceipts(registerId: string): Promise<Prisma.Decimal> {
    const agg = await this.prisma.cashMovement.aggregate({
      where: { registerId, type: 'SALE_RECEIPT' },
      _sum: { amount: true },
    });
    return new Prisma.Decimal(agg._sum.amount ?? 0).toDecimalPlaces(2);
  }

  /** Conta as contas OPEN da operação (RB-012/012a). */
  private async openAccountCount(businessSessionId: string): Promise<number> {
    return this.prisma.account.count({ where: { businessSessionId, status: 'OPEN' } });
  }

  /** Prévia do fechamento (RB-011): esperado + se há conta aberta bloqueando. */
  async getCloseSummary(operatorId: string): Promise<RegisterCloseSummary> {
    const register = await this.getCurrentRowForOperatorOrThrow(operatorId);
    const cashReceipts = await this.cashReceipts(register.id);
    const expectedAmount = expectedCash(register.openingAmount, cashReceipts);
    const openAccountCount = await this.openAccountCount(register.businessSessionId);
    return {
      registerId: register.id,
      openingAmount: register.openingAmount.toFixed(2),
      cashReceipts: cashReceipts.toFixed(2),
      expectedAmount: expectedAmount.toFixed(2),
      openAccountCount,
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

        const agg = await tx.cashMovement.aggregate({
          where: { registerId: register.id, type: 'SALE_RECEIPT' },
          _sum: { amount: true },
        });
        const cashReceipts = new Prisma.Decimal(agg._sum.amount ?? 0).toDecimalPlaces(2);
        const expectedAmount = expectedCash(register.openingAmount, cashReceipts);
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
