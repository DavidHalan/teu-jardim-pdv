import { ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { RegistersService } from '../registers/registers.service';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import { PaymentMethod, PaymentStatus } from '@teu-jardim/shared';
import type { PaymentDto, PaymentTenderInput } from '@teu-jardim/shared';
import { Prisma } from '../../prisma/client';
import { assertTendersMatchTotal, cashPortion, sumTenders } from './payment-math';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly audit: AuditService,
    private readonly registers: RegistersService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Liquida 1+ contas (RB-035/037/038/039). Grupo de 1 = conta única (ADR-0007).
   * Caixa-gated. Contas → PAID (número liberado). Parcela em dinheiro vira SALE_RECEIPT.
   * Idempotente por Idempotency-Key (ADR-0019): retry devolve o pagamento original.
   */
  async pay(
    accountIds: string[],
    tenderInputs: PaymentTenderInput[],
    userId: string,
    idempotencyKey: string,
  ): Promise<PaymentDto> {
    return this.idempotency.execute<PaymentDto>({
      command: 'PAY',
      key: idempotencyKey,
      request: { accountIds, tenders: tenderInputs },
      run: async (tx) => {
        // 1) Caixa aberto do operador (Payment.registerId).
        const register = await this.registers.getCurrentRowForOperatorOrThrow(userId);

        // 2) Contas: todas OPEN e na operação do caixa.
        const accounts = await tx.account.findMany({ where: { id: { in: accountIds } } });
        if (accounts.length !== accountIds.length) {
          throw new ConflictException('Conta não encontrada.');
        }
        for (const a of accounts) {
          if (a.status !== 'OPEN') throw new ConflictException('Conta não está aberta.');
          if (a.businessSessionId !== register.businessSessionId) {
            throw new ConflictException('Conta não pertence à operação corrente.');
          }
        }

        // 3) Total do grupo = Σ totais-com-desconto (RB-036). Tenders devem casar (RB-037).
        const groupTotal = accounts
          .reduce((acc, a) => acc.add(a.total), new Prisma.Decimal(0))
          .toDecimalPlaces(2);
        const tenders = tenderInputs.map((t) => ({ method: t.method, amount: new Prisma.Decimal(t.amount) }));
        assertTendersMatchTotal(tenders, groupTotal);

        // 4) Persistência — mesma transação da chave de idempotência.
        const group = await tx.accountGroup.create({
          data: { businessSessionId: register.businessSessionId, createdById: userId },
        });

        for (const accountId of accountIds) {
          try {
            await tx.accountGroupMember.create({ data: { accountGroupId: group.id, accountId } });
          } catch (err) {
            if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
              throw new ConflictException('Conta já foi liquidada (RB-039).');
            }
            throw err;
          }
        }

        const payment = await tx.payment.create({
          data: {
            accountGroupId: group.id,
            registerId: register.id,
            total: groupTotal,
            status: 'SETTLED',
            createdById: userId,
          },
        });

        await tx.paymentTender.createMany({
          data: tenders.map((t) => ({ paymentId: payment.id, method: t.method, amount: t.amount })),
        });

        await tx.account.updateMany({
          where: { id: { in: accountIds } },
          data: { status: 'PAID', closedAt: new Date() },
        });

        const cash = cashPortion(tenders);
        if (cash.greaterThan(0)) {
          await tx.cashMovement.create({
            data: { registerId: register.id, type: 'SALE_RECEIPT', amount: cash, userId },
          });
        }

        await this.audit.log(
          'PAYMENT_SETTLED',
          {
            userId,
            entityType: 'Payment',
            entityId: payment.id,
            metadata: { accountIds, total: groupTotal.toFixed(2), tenderTotal: sumTenders(tenders).toFixed(2) },
          },
          tx,
        );

        return {
          id: payment.id,
          accountGroupId: group.id,
          registerId: register.id,
          total: groupTotal.toFixed(2),
          status: PaymentStatus.SETTLED,
          tenders: tenderInputs.map((t) => ({ method: t.method as PaymentMethod, amount: new Prisma.Decimal(t.amount).toFixed(2) })),
          accountIds,
          createdAt: payment.createdAt.toISOString(),
        };
      },
    });
  }
}
