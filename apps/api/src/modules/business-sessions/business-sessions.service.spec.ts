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

describe('BusinessSessionsService.closeSession', () => {
  const make = (over: { openRegisters?: number; openAccounts?: number; session?: any } = {}) => {
    const session = 'session' in over ? over.session : { id: 's1', name: 'Almoço', status: 'OPEN', openedById: 'u1', openedAt: new Date('2026-06-15T20:00:00Z'), closedAt: null };
    const prisma = {
      businessSession: {
        findFirst: vi.fn().mockResolvedValue(session),
        update: vi.fn().mockResolvedValue({ ...session, status: 'CLOSED', closedAt: new Date('2026-06-15T23:00:00Z') }),
      },
      register: { count: vi.fn().mockResolvedValue(over.openRegisters ?? 0) },
      account: { count: vi.fn().mockResolvedValue(over.openAccounts ?? 0) },
    } as any;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
    return { service: new BusinessSessionsService(prisma, audit), prisma, audit };
  };

  it('encerra a operação quando não há caixa nem conta aberta; audita SESSION_CLOSE (RB-007/007b)', async () => {
    const { service, audit } = make();
    const dto = await service.closeSession('u1');
    expect(dto.status).toBe('CLOSED');
    expect(audit.log).toHaveBeenCalledWith('SESSION_CLOSE', expect.objectContaining({ userId: 'u1', entityType: 'BusinessSession', entityId: 's1' }));
  });

  it('bloqueia encerrar se houver caixa OPEN (RB-007b → 409)', async () => {
    const { service } = make({ openRegisters: 1 });
    await expect(service.closeSession('u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('bloqueia encerrar se houver conta OPEN (→ 409)', async () => {
    const { service } = make({ openAccounts: 2 });
    await expect(service.closeSession('u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejeita encerrar quando não há operação aberta (409)', async () => {
    const { service } = make({ session: null });
    await expect(service.closeSession('u1')).rejects.toBeInstanceOf(ConflictException);
  });
});
