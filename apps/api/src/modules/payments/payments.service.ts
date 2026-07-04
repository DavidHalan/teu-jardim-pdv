import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegistersService } from '../registers/registers.service';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import { PaymentMethod, PaymentStatus, TabType } from '@teu-jardim/shared';
import type { PaymentDto, PaymentListResponse, PaymentTenderInput } from '@teu-jardim/shared';
import { Prisma } from '../../prisma/client';
import { assertTendersMatchTotal, cashPortion, sumTenders } from './payment-math';

type TenderRow = { method: string; amount: Prisma.Decimal };

function tenderDtos(tenders: TenderRow[]): { method: PaymentMethod; amount: string }[] {
  return tenders.map((t) => ({ method: t.method as PaymentMethod, amount: t.amount.toFixed(2) }));
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
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

  /**
   * Estorno (RB-048/049/050, ADR-0013/0030). Caixa-gated; só SETTLED; só operação OPEN
   * corrente. Tudo-ou-nada na tx: Payment → REVERSED (empilha, nunca apaga), vínculos do
   * grupo liberados (released_at — re-cobrança possível), contas → OPEN (ContaReaberta),
   * parcela em dinheiro sai do caixa de quem estorna (PAYMENT_REVERSAL). Bloqueado se
   * qualquer número do grupo já estiver ocupado por outra conta OPEN (uniq_open_account
   * é o backstop DB). Idempotente por Idempotency-Key.
   */
  async reverse(
    paymentId: string,
    reason: string,
    userId: string,
    idempotencyKey: string,
  ): Promise<PaymentDto> {
    return this.idempotency.execute<PaymentDto>({
      command: 'REVERSE_PAYMENT',
      key: idempotencyKey,
      request: { paymentId, reason },
      run: async (tx) => {
        // Movimento RB-049 sai do caixa OPEN de quem executa (dono, 2026-07-04).
        const register = await this.registers.getCurrentRowForOperatorOrThrow(userId);

        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: {
            tenders: true,
            accountGroup: { include: { members: { include: { account: true } } } },
          },
        });
        if (!payment) throw new NotFoundException('Pagamento não encontrado.');
        if (payment.status !== 'SETTLED') {
          throw new ConflictException('Só pagamento liquidado pode ser estornado (RB-048).');
        }
        if (payment.accountGroup.businessSessionId !== register.businessSessionId) {
          throw new ConflictException('Pagamento não pertence à operação corrente (RB-048).');
        }

        const accounts = payment.accountGroup.members.map((m) => m.account);
        // RB-050: tudo-ou-nada — nenhum número do grupo pode estar ocupado por outra conta OPEN.
        for (const a of accounts) {
          const occupied = await tx.account.findFirst({
            where: { tabType: a.tabType, number: a.number, status: 'OPEN', NOT: { id: a.id } },
          });
          if (occupied) {
            throw new ConflictException(
              `Número ${a.number} já está em uso por outra conta aberta (RB-050).`,
            );
          }
        }

        await tx.payment.update({ where: { id: payment.id }, data: { status: 'REVERSED' } });
        await tx.accountGroupMember.updateMany({
          where: { accountGroupId: payment.accountGroupId },
          data: { releasedAt: new Date() },
        });

        const accountIds = accounts.map((a) => a.id);
        try {
          await tx.account.updateMany({
            where: { id: { in: accountIds } },
            data: { status: 'OPEN', closedAt: null },
          });
        } catch (err) {
          // Corrida pós-check: uniq_open_account (RB-003) barrou a reabertura.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            throw new ConflictException('Número já está em uso por outra conta aberta (RB-050).');
          }
          throw err;
        }

        const cash = cashPortion(
          payment.tenders.map((t) => ({ method: t.method as PaymentMethod, amount: t.amount })),
        );
        if (cash.greaterThan(0)) {
          await tx.cashMovement.create({
            data: { registerId: register.id, type: 'PAYMENT_REVERSAL', amount: cash, reason, userId },
          });
        }

        await this.audit.log(
          'PAYMENT_REVERSED', // PagamentoEstornado
          {
            userId,
            entityType: 'Payment',
            entityId: payment.id,
            reason,
            metadata: { accountIds, total: payment.total.toFixed(2), cashReturned: cash.toFixed(2) },
          },
          tx,
        );
        for (const a of accounts) {
          await this.audit.log(
            'ACCOUNT_REOPENED', // ContaReaberta
            {
              userId,
              entityType: 'Account',
              entityId: a.id,
              reason,
              metadata: { paymentId: payment.id, tabType: a.tabType, number: a.number },
            },
            tx,
          );
        }

        return {
          id: payment.id,
          accountGroupId: payment.accountGroupId,
          registerId: payment.registerId,
          total: payment.total.toFixed(2),
          status: PaymentStatus.REVERSED,
          tenders: tenderDtos(payment.tenders),
          accountIds,
          createdAt: payment.createdAt.toISOString(),
        };
      },
    });
  }

  /** GET /payments/:id — snapshot consultável (SETTLED permanece após estorno via histórico). */
  async getById(paymentId: string): Promise<PaymentDto> {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { tenders: true, accountGroup: { include: { members: true } } },
    });
    if (!p) throw new NotFoundException('Pagamento não encontrado.');
    return {
      id: p.id,
      accountGroupId: p.accountGroupId,
      registerId: p.registerId,
      total: p.total.toFixed(2),
      status: p.status as PaymentStatus,
      tenders: tenderDtos(p.tenders),
      accountIds: p.accountGroup.members.map((m) => m.accountId),
      createdAt: p.createdAt.toISOString(),
    };
  }

  /** GET /payments — pagamentos da operação OPEN corrente (base do estorno), desc. */
  async listForCurrentSession(): Promise<PaymentListResponse> {
    const session = await this.prisma.businessSession.findFirst({ where: { status: 'OPEN' } });
    if (!session) return { payments: [] };
    const rows = await this.prisma.payment.findMany({
      where: { accountGroup: { businessSessionId: session.id } },
      include: {
        tenders: true,
        accountGroup: {
          include: { members: { include: { account: { select: { id: true, tabType: true, number: true } } } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      payments: rows.map((p) => ({
        id: p.id,
        total: p.total.toFixed(2),
        status: p.status as PaymentStatus,
        tenders: tenderDtos(p.tenders),
        accounts: p.accountGroup.members.map((m) => ({
          id: m.account.id,
          tabType: m.account.tabType as TabType,
          number: m.account.number,
        })),
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }
}
