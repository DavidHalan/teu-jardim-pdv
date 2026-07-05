import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { AccountsService } from './accounts.service';

const sessionRow = { id: 's1', status: 'OPEN' };

// Conta recém-criada e a releitura com includes (itens vazios).
const createdAccount = { id: 'a1' };
const reloaded = {
  id: 'a1',
  tabType: 'COMANDA',
  number: 25,
  status: 'OPEN',
  openedAt: new Date('2026-06-14T13:00:00Z'),
  subtotal: new Prisma.Decimal('0'),
  discountTotal: new Prisma.Decimal('0'),
  total: new Prisma.Decimal('0'),
  items: [],
};

const make = (over: { create?: any; findUnique?: any } = {}) => {
  const prisma = {
    account: {
      create: over.create ?? vi.fn().mockResolvedValue(createdAccount),
      findUnique: over.findUnique ?? vi.fn().mockResolvedValue(reloaded),
    },
  } as any;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
  const sessions = { getCurrentRowOrThrow: vi.fn().mockResolvedValue(sessionRow) } as any;
  return { service: new AccountsService(prisma, audit, sessions, {} as any, {} as any), prisma, audit, sessions };
};

describe('AccountsService.openAccount', () => {
  it('opens an account in the current session and audits ACCOUNT_OPEN (RB-006/043)', async () => {
    const { service, prisma, audit } = make();
    const dto = await service.openAccount('COMANDA' as any, 25, 'u1');

    expect(prisma.account.create).toHaveBeenCalledWith({
      data: { businessSessionId: 's1', tabType: 'COMANDA', number: 25, openedById: 'u1' },
    });
    expect(audit.log).toHaveBeenCalledWith('ACCOUNT_OPEN', {
      userId: 'u1', entityType: 'Account', entityId: 'a1',
    });
    expect(dto).toEqual({
      id: 'a1', tabType: 'COMANDA', number: 25, status: 'OPEN',
      openedAt: '2026-06-14T13:00:00.000Z', subtotal: '0.00', discountTotal: '0.00',
      total: '0.00', items: [],
    });
  });

  it('rejects a second OPEN account for the same (tabType, number) — P2002 → 409 (RB-003)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002', clientVersion: 'x',
    });
    const { service } = make({ create: vi.fn().mockRejectedValue(p2002) });
    await expect(service.openAccount('COMANDA' as any, 25, 'u1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects opening when no operation is open (RB-008)', async () => {
    const { service, sessions } = make();
    sessions.getCurrentRowOrThrow = vi.fn().mockRejectedValue(new ConflictException('x'));
    await expect(service.openAccount('COMANDA' as any, 25, 'u1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('AccountsService.applyDiscount', () => {
  it('aplica PERCENT, grava Discount, recalcula total e audita (RB-026/027/028/043)', async () => {
    const account = { id: 'a1', status: 'OPEN', subtotal: new Prisma.Decimal('42.65'), discountTotal: new Prisma.Decimal('0') };
    const tx = {
      account: {
        findUnique: vi.fn().mockResolvedValue(account),
        update: vi.fn().mockResolvedValue({}),
      },
      accountItem: { findMany: vi.fn().mockResolvedValue([{ lineTotal: new Prisma.Decimal('42.65') }]) },
      discount: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue({ type: 'PERCENT', value: new Prisma.Decimal('10') }),
      },
    };
    const prisma = { $transaction: vi.fn(async (cb: any) => cb(tx)), account: { findUnique: vi.fn().mockResolvedValue({ ...account, openedAt: new Date(), tabType: 'COMANDA', number: 25, total: new Prisma.Decimal('38.38'), items: [] }) } } as any;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
    const sessions = {} as any;
    const service = new AccountsService(prisma, audit, sessions, {} as any, {} as any);

    await service.applyDiscount('a1', 'PERCENT' as any, '10', 'u1');

    expect(tx.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a1' }, data: expect.objectContaining({ discountTotal: expect.anything(), total: expect.anything() }) }),
    );
    const updateArg = tx.account.update.mock.calls[0][0];
    expect(updateArg.data.discountTotal.toFixed(2)).toBe('4.27');
    expect(updateArg.data.total.toFixed(2)).toBe('38.38');
    expect(audit.log).toHaveBeenCalledWith('DISCOUNT_APPLIED', expect.objectContaining({ userId: 'u1', entityType: 'Account', entityId: 'a1' }));
  });

  it('rejeita desconto em conta não OPEN (409)', async () => {
    const tx = { account: { findUnique: vi.fn().mockResolvedValue({ id: 'a1', status: 'PAID' }) } };
    const prisma = { $transaction: vi.fn(async (cb: any) => cb(tx)) } as any;
    const service = new AccountsService(prisma, { log: vi.fn() } as any, {} as any, {} as any, {} as any);
    await expect(service.applyDiscount('a1', 'FIXED' as any, '5', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });
});

/** tx fake p/ cancelItem: conta OPEN, item ativo de 30, resta 1 item de 20 após cancelar. */
const makeCancelItemTx = (over: {
  account?: any;
  item?: any;
  remaining?: { lineTotal: Prisma.Decimal }[];
  lastDiscount?: any;
} = {}) => {
  const tx = {
    account: {
      findUnique: vi.fn().mockResolvedValue(
        over.account === undefined ? { id: 'a1', status: 'OPEN' } : over.account,
      ),
      update: vi.fn().mockResolvedValue({}),
    },
    accountItem: {
      findFirst: vi.fn().mockResolvedValue(
        over.item === undefined
          ? { id: 'i1', accountId: 'a1', kdsStatus: 'PENDING', lineTotal: new Prisma.Decimal('30.00') }
          : over.item,
      ),
      update: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue(over.remaining ?? [{ lineTotal: new Prisma.Decimal('20.00') }]),
    },
    discount: { findFirst: vi.fn().mockResolvedValue(over.lastDiscount ?? null) },
  };
  const prisma = {
    $transaction: vi.fn(async (cb: any) => cb(tx)),
    account: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'a1', status: 'OPEN', openedAt: new Date(), tabType: 'COMANDA', number: 25,
        subtotal: new Prisma.Decimal('20'), discountTotal: new Prisma.Decimal('0'),
        total: new Prisma.Decimal('20'), items: [],
      }),
    },
  } as any;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
  const service = new AccountsService(prisma, audit, {} as any, {} as any, {} as any);
  return { service, tx, audit };
};

describe('AccountsService.cancelItem (RB-029/031/056 + recálculo RB-028/034)', () => {
  it('cancela o item, recalcula totais e audita ITEM_CANCELED com motivo', async () => {
    const { service, tx, audit } = makeCancelItemTx();
    await service.cancelItem('a1', 'i1', 'pedido errado', 'u1');

    expect(tx.accountItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'i1' }, data: { kdsStatus: 'CANCELED', canceledReason: 'pedido errado' } }),
    );
    const totals = tx.account.update.mock.calls[0][0].data;
    expect(totals.subtotal.toFixed(2)).toBe('20.00');
    expect(totals.discountTotal.toFixed(2)).toBe('0.00');
    expect(totals.total.toFixed(2)).toBe('20.00');
    expect(audit.log).toHaveBeenCalledWith(
      'ITEM_CANCELED',
      expect.objectContaining({ userId: 'u1', entityType: 'AccountItem', entityId: 'i1', reason: 'pedido errado' }),
      tx,
    );
  });

  it('desconto FIXED clampa ao novo subtotal — total nunca negativo (RB-034)', async () => {
    const { service, tx } = makeCancelItemTx({
      lastDiscount: { type: 'FIXED', value: new Prisma.Decimal('30.00') },
    });
    await service.cancelItem('a1', 'i1', 'x', 'u1');
    const totals = tx.account.update.mock.calls[0][0].data;
    expect(totals.discountTotal.toFixed(2)).toBe('20.00'); // clamp em 20 (subtotal)
    expect(totals.total.toFixed(2)).toBe('0.00');
  });

  it('desconto PERCENT re-deriva sobre o novo subtotal (RB-028 uniforme)', async () => {
    const { service, tx } = makeCancelItemTx({
      lastDiscount: { type: 'PERCENT', value: new Prisma.Decimal('10') },
    });
    await service.cancelItem('a1', 'i1', 'x', 'u1');
    const totals = tx.account.update.mock.calls[0][0].data;
    expect(totals.discountTotal.toFixed(2)).toBe('2.00');
    expect(totals.total.toFixed(2)).toBe('18.00');
  });

  it('item já cancelado → 409; item de outra conta → 404; conta não OPEN → 409', async () => {
    const canceled = makeCancelItemTx({ item: { id: 'i1', kdsStatus: 'CANCELED' } });
    await expect(canceled.service.cancelItem('a1', 'i1', 'x', 'u1')).rejects.toBeInstanceOf(ConflictException);

    const missing = makeCancelItemTx({ item: null });
    await expect(missing.service.cancelItem('a1', 'nope', 'x', 'u1')).rejects.toBeInstanceOf(NotFoundException);

    const paid = makeCancelItemTx({ account: { id: 'a1', status: 'PAID' } });
    await expect(paid.service.cancelItem('a1', 'i1', 'x', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AccountsService.cancelAccount', () => {
  it('cancela a conta + itens, audita com motivo, libera o número (RB-030/031)', async () => {
    const tx = {
      account: { findUnique: vi.fn().mockResolvedValue({ id: 'a1', status: 'OPEN' }), update: vi.fn().mockResolvedValue({}) },
      accountItem: { updateMany: vi.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: vi.fn(async (cb: any) => cb(tx)), account: { findUnique: vi.fn().mockResolvedValue({ id: 'a1', status: 'CANCELED', openedAt: new Date(), tabType: 'COMANDA', number: 25, subtotal: new Prisma.Decimal('0'), discountTotal: new Prisma.Decimal('0'), total: new Prisma.Decimal('0'), items: [] }) } } as any;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
    const service = new AccountsService(prisma, audit, {} as any, {} as any, {} as any);

    await service.cancelAccount('a1', 'cliente desistiu', 'u1');

    expect(tx.account.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'a1' }, data: expect.objectContaining({ status: 'CANCELED' }) }));
    expect(audit.log).toHaveBeenCalledWith('ACCOUNT_CANCEL', expect.objectContaining({ userId: 'u1', entityType: 'Account', entityId: 'a1', reason: 'cliente desistiu' }));
  });

  it('rejeita cancelar conta não OPEN (409)', async () => {
    const tx = { account: { findUnique: vi.fn().mockResolvedValue({ id: 'a1', status: 'PAID' }) } };
    const prisma = { $transaction: vi.fn(async (cb: any) => cb(tx)) } as any;
    const service = new AccountsService(prisma, { log: vi.fn() } as any, {} as any, {} as any, {} as any);
    await expect(service.cancelAccount('a1', 'x', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });
});
