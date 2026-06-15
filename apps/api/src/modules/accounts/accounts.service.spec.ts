import { describe, it, expect, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
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
  return { service: new AccountsService(prisma, audit, sessions), prisma, audit, sessions };
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
