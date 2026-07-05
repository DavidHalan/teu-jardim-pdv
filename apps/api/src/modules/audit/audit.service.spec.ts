import { describe, it, expect, vi } from 'vitest';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('persists an audit record with the given event and metadata (RB-043)', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'a1' });
    const prisma = { auditLog: { create } } as any;
    const service = new AuditService(prisma);

    await service.log('AUTH_LOGIN', {
      userId: 'u1',
      entityType: 'User',
      entityId: 'u1',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        eventType: 'AUTH_LOGIN',
        userId: 'u1',
        entityType: 'User',
        entityId: 'u1',
        reason: undefined,
        metadata: undefined,
      },
    });
  });
});

const row = (id: string) => ({
  id,
  eventType: 'PAYMENT_SETTLED',
  userId: 'u1',
  entityType: 'Payment',
  entityId: 'p1',
  reason: null,
  metadata: { total: '10.00' },
  createdAt: new Date('2026-07-05T12:00:00Z'),
  user: { name: 'Caixa' },
});

const makeQuery = (rows: unknown[]) => {
  const prisma = { auditLog: { findMany: vi.fn().mockResolvedValue(rows), create: vi.fn() } } as any;
  return { service: new AuditService(prisma), prisma };
};

describe('AuditService.query (F-8, RB-044 — consulta read-only, cursor keyset)', () => {
  it('aplica filtros e ordena desc por (createdAt, id); resolve o nome do autor', async () => {
    const { service, prisma } = makeQuery([row('a1')]);
    const res = await service.query({ eventType: 'PAYMENT_SETTLED', userId: 'u1', from: '2026-07-01T00:00:00Z' });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventType: 'PAYMENT_SETTLED',
          userId: 'u1',
          createdAt: { gte: new Date('2026-07-01T00:00:00Z') },
        }),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(res.entries[0]).toMatchObject({ id: 'a1', userName: 'Caixa', metadata: { total: '10.00' } });
    expect(res.nextCursor).toBeNull();
  });

  it('pagina por keyset: sonda limit+1; nextCursor = id da última da página; cursor pula a âncora', async () => {
    const { service, prisma } = makeQuery([row('a1'), row('a2'), row('a3')]); // limit 2 → sobra 1
    const res = await service.query({ limit: 2, cursor: 'a0' });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3, cursor: { id: 'a0' }, skip: 1 }),
    );
    expect(res.entries.map((e) => e.id)).toEqual(['a1', 'a2']);
    expect(res.nextCursor).toBe('a2');
  });

  it('limita o page size a 100 (anti-abuso)', async () => {
    const { service, prisma } = makeQuery([]);
    await service.query({ limit: 100 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
  });
});
