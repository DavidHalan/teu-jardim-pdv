import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BusinessSessionsService } from '../business-sessions/business-sessions.service';
import { computeLine } from './account-math';
import { computeDiscountTotal } from './account-discount';
import { AccountStatus, DiscountType, ProductType, TabType } from '@teu-jardim/shared';
import type {
  AccountDto,
  AccountListResponse,
  AccountSummaryDto,
  PlaceItemInput,
} from '@teu-jardim/shared';
import { Prisma } from '../../prisma/client';

// Releitura padrão da conta com itens (não cancelados), produto e observações.
const accountInclude = {
  items: {
    where: { NOT: { kdsStatus: 'CANCELED' as const } },
    orderBy: { placedAt: 'asc' as const },
    include: { product: true, observations: true },
  },
};

// Tipo da releitura. Se `Prisma.AccountGetPayload<{ include: typeof accountInclude }>` der
// erro de tsc por o const carregar `where`/`orderBy` (não só include), trocar pelo include
// "puro" só com a forma (o `where`/`orderBy` ficam só no runtime, não no tipo):
//   type AccountWithItems = Prisma.AccountGetPayload<{
//     include: { items: { include: { product: true; observations: true } } };
//   }>;
type AccountWithItems = Prisma.AccountGetPayload<{ include: typeof accountInclude }>;

function toAccountDto(a: AccountWithItems): AccountDto {
  return {
    id: a.id,
    tabType: a.tabType as TabType,
    number: a.number,
    status: a.status as AccountStatus,
    openedAt: a.openedAt.toISOString(),
    subtotal: a.subtotal.toFixed(2),
    discountTotal: a.discountTotal.toFixed(2),
    total: a.total.toFixed(2),
    items: a.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product.name,
      type: it.product.type as ProductType,
      quantity: it.quantity,
      weightGrams: it.weightGrams,
      unitPrice: it.unitPrice.toFixed(2),
      lineTotal: it.lineTotal.toFixed(2),
      observations: it.observations.map((o) => ({ text: o.text })),
    })),
  };
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: BusinessSessionsService,
  ) {}

  /** Abre conta na operação corrente. RB-006/008; RB-003 via índice parcial (P2002→409). */
  async openAccount(tabType: TabType, number: number, userId: string): Promise<AccountDto> {
    const session = await this.sessions.getCurrentRowOrThrow(); // RB-008

    let created: { id: string };
    try {
      created = await this.prisma.account.create({
        data: { businessSessionId: session.id, tabType, number, openedById: userId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          `Já existe uma conta aberta para ${tabType.toLowerCase()} ${number}.`,
        );
      }
      throw err;
    }

    await this.audit.log('ACCOUNT_OPEN', {
      userId,
      entityType: 'Account',
      entityId: created.id,
    });
    return this.getById(created.id);
  }

  /** Contas OPEN da operação corrente (RB-005). Sem operação → lista vazia. */
  async listOpen(): Promise<AccountListResponse> {
    const session = await this.prisma.businessSession.findFirst({ where: { status: 'OPEN' } });
    if (!session) return { accounts: [] };

    const rows = await this.prisma.account.findMany({
      where: { businessSessionId: session.id, status: 'OPEN' },
      orderBy: [{ tabType: 'asc' }, { number: 'asc' }],
      include: { items: { where: { NOT: { kdsStatus: 'CANCELED' } }, select: { id: true } } },
    });

    return {
      accounts: rows.map(
        (a): AccountSummaryDto => ({
          id: a.id,
          tabType: a.tabType as TabType,
          number: a.number,
          total: a.total.toFixed(2),
          itemCount: a.items.length,
        }),
      ),
    };
  }

  /** Resumo da conta (RB-018). 404 se não existir. */
  async getById(id: string): Promise<AccountDto> {
    const a = await this.prisma.account.findUnique({ where: { id }, include: accountInclude });
    if (!a) throw new NotFoundException('Conta não encontrada.');
    return toAccountDto(a);
  }

  /**
   * Lança o pedido montado de uma vez (RB-018). Numa transação:
   * valida cada produto (RB-017), calcula a linha (RB-014/019), persiste itens+observações,
   * recalcula os totais. Audita ORDER_PLACED. Conta precisa estar OPEN.
   */
  async placeItems(accountId: string, inputs: PlaceItemInput[], userId: string): Promise<AccountDto> {
    if (inputs.length === 0) {
      throw new BadRequestException('Pedido vazio: selecione ao menos um item.');
    }

    await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) throw new NotFoundException('Conta não encontrada.');
      if (account.status !== 'OPEN') {
        throw new ConflictException('A conta não está aberta.');
      }

      for (const input of inputs) {
        const product = await tx.product.findUnique({ where: { id: input.productId } });
        if (!product) throw new NotFoundException(`Produto ${input.productId} não encontrado.`);
        if (!product.active) {
          throw new BadRequestException(`Produto "${product.name}" está inativo (RB-017).`);
        }

        const line = computeLine({
          type: product.type as ProductType,
          price: product.price,
          quantity: input.quantity,
          weightGrams: input.weightGrams,
        });

        const item = await tx.accountItem.create({
          data: {
            accountId,
            productId: product.id,
            quantity: line.quantity,
            weightGrams: line.weightGrams,
            unitPrice: line.unitPrice, // snapshot (RB-019)
            lineTotal: line.lineTotal,
            placedById: userId,
          },
        });

        for (const obsId of input.observationIds ?? []) {
          const obs = await tx.productObservation.findFirst({
            where: { id: obsId, productId: product.id },
          });
          if (obs) {
            await tx.accountItemObservation.create({
              data: { accountItemId: item.id, observationId: obs.id, text: obs.name }, // snapshot (RB-021)
            });
          }
        }
      }

      // Recalcula totais (RB-028 prepara o terreno; desconto é S4 → discountTotal fica como está).
      const items = await tx.accountItem.findMany({
        where: { accountId, NOT: { kdsStatus: 'CANCELED' } },
        select: { lineTotal: true },
      });
      const subtotal = items
        .reduce((acc, it) => acc.add(it.lineTotal), new Prisma.Decimal(0))
        .toDecimalPlaces(2);
      const total = subtotal.sub(account.discountTotal).toDecimalPlaces(2);

      await tx.account.update({ where: { id: accountId }, data: { subtotal, total } });
    });

    await this.audit.log('ORDER_PLACED', {
      userId,
      entityType: 'Account',
      entityId: accountId,
      metadata: { itemCount: inputs.length },
    });
    return this.getById(accountId);
  }

  /** Aplica desconto na conta (RB-026/027/028). Recalcula o total. Caixa-gated no controller. */
  async applyDiscount(
    accountId: string,
    type: DiscountType,
    value: string,
    userId: string,
    reason?: string,
  ): Promise<AccountDto> {
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) throw new NotFoundException('Conta não encontrada.');
      if (account.status !== 'OPEN') throw new ConflictException('A conta não está aberta.');

      const discountTotal = computeDiscountTotal(account.subtotal, type, new Prisma.Decimal(value));
      const total = account.subtotal.sub(discountTotal).toDecimalPlaces(2);

      await tx.discount.create({
        data: { accountId, type, value, appliedById: userId, reason },
      });
      await tx.account.update({ where: { id: accountId }, data: { discountTotal, total } });
    });

    await this.audit.log('DISCOUNT_APPLIED', {
      userId,
      entityType: 'Account',
      entityId: accountId,
      reason,
      metadata: { type, value },
    });
    return this.getById(accountId);
  }

  /** Cancela a conta inteira (RB-030/031). Itens → CANCELED; número liberado (status ≠ OPEN). */
  async cancelAccount(accountId: string, reason: string, userId: string): Promise<AccountDto> {
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account) throw new NotFoundException('Conta não encontrada.');
      if (account.status !== 'OPEN') throw new ConflictException('A conta não está aberta.');

      await tx.accountItem.updateMany({
        where: { accountId, NOT: { kdsStatus: 'CANCELED' } },
        data: { kdsStatus: 'CANCELED', canceledReason: reason },
      });
      await tx.account.update({
        where: { id: accountId },
        data: { status: 'CANCELED', closedAt: new Date() },
      });
    });

    await this.audit.log('ACCOUNT_CANCEL', {
      userId,
      entityType: 'Account',
      entityId: accountId,
      reason,
    });
    return this.getById(accountId);
  }
}
