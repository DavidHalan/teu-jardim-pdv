import { describe, it, expect, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { BusinessSessionsService } from './business-sessions.service';

const makeService = (over: { findFirst?: unknown } = {}) => {
  const prisma = {
    businessSession: {
      findFirst: over.findFirst ?? vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 's1', name: 'Almoço', status: 'OPEN', openedById: 'u1',
        openedAt: new Date('2026-06-14T12:00:00Z'), closedAt: null,
      }),
    },
  } as any;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
  return { service: new BusinessSessionsService(prisma, audit), prisma, audit };
};

describe('BusinessSessionsService', () => {
  it('opens a session, audits SESSION_OPEN, returns the dto (RB-007)', async () => {
    const { service, prisma, audit } = makeService();
    const dto = await service.openSession('Almoço', 'u1');

    expect(prisma.businessSession.create).toHaveBeenCalledWith({
      data: { name: 'Almoço', openedById: 'u1' },
    });
    expect(audit.log).toHaveBeenCalledWith('SESSION_OPEN', {
      userId: 'u1', entityType: 'BusinessSession', entityId: 's1',
    });
    expect(dto).toEqual({
      id: 's1', name: 'Almoço', status: 'OPEN', openedById: 'u1',
      openedAt: '2026-06-14T12:00:00.000Z', closedAt: null,
    });
  });

  it('rejects a second open session while one is OPEN (proposed RB-007a)', async () => {
    const { service } = makeService({
      findFirst: vi.fn().mockResolvedValue({ id: 's0', status: 'OPEN' }),
    });
    await expect(service.openSession('Jantar', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('getCurrent returns null when no session is OPEN', async () => {
    const { service } = makeService();
    expect(await service.getCurrent()).toBeNull();
  });
});
