import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@teu-jardim/shared';
import { Prisma } from '../../prisma/client';
import { ReportsService } from './reports.service';

const session = { id: 's1', status: 'OPEN', openedAt: new Date(), closedAt: null };

const make = (over: { current?: any; byId?: any } = {}) => {
  const prisma = {
    businessSession: {
      findFirst: vi.fn().mockResolvedValue(over.current === undefined ? session : over.current),
      findUnique: vi.fn().mockResolvedValue(over.byId === undefined ? session : over.byId),
    },
    account: { aggregate: vi.fn().mockResolvedValue({ _count: { id: 0 }, _sum: { total: null } }) },
  } as any;
  return { service: new ReportsService(prisma), prisma };
};

describe('ReportsService.get (RB-053/053a)', () => {
  it('kind desconhecido → 400', async () => {
    const { service } = make();
    await expect(service.get('lucro-magico', Role.ADMIN)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Caixa acessa closing; qualquer outro relatório → 403 (RB-053a)', async () => {
    const { service } = make();
    await expect(service.get('sales-by-method', Role.CASHIER)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.get('exceptions', Role.CASHIER)).rejects.toBeInstanceOf(ForbiddenException);
    // ticket p/ ADMIN passa (usa o aggregate mockado)
    const ticket = (await service.get('ticket', Role.ADMIN)) as { accountCount: number; average: string };
    expect(ticket).toMatchObject({ accountCount: 0, average: '0.00' });
  });

  it('sem operação aberta e sem businessSessionId → 409; id inexistente → 404', async () => {
    const closed = make({ current: null });
    await expect(closed.service.get('ticket', Role.ADMIN)).rejects.toBeInstanceOf(ConflictException);

    const missing = make({ byId: null });
    await expect(missing.service.get('ticket', Role.ADMIN, 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ticket médio divide receita por contas pagas (RB-053 §5)', async () => {
    const { service, prisma } = make();
    prisma.account.aggregate.mockResolvedValue({
      _count: { id: 3 },
      _sum: { total: new Prisma.Decimal('100.00') },
    });
    const r = (await service.get('ticket', Role.ADMIN)) as { revenue: string; average: string };
    expect(r.revenue).toBe('100.00');
    expect(r.average).toBe('33.33');
  });
});
