import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrintJobStatus } from '@teu-jardim/shared';
import { PrintService } from './print.service';

const printedRow = {
  id: 'j1',
  accountId: 'a1',
  stationId: 'st1',
  batchId: 'k1',
  status: 'PRINTED',
  payload: {},
  error: null,
  placedById: 'u1',
  dismissedAt: null,
  createdAt: new Date('2026-07-04T12:00:00Z'),
  ackedAt: new Date('2026-07-04T12:00:05Z'),
};

const make = (over: { updatedCount?: number; row?: any; overdue?: any[] } = {}) => {
  const prisma = {
    printJob: {
      updateMany: vi.fn().mockResolvedValue({ count: over.updatedCount ?? 1 }),
      findUnique: vi.fn().mockResolvedValue(over.row === undefined ? printedRow : over.row),
      findMany: vi.fn().mockResolvedValue(over.overdue ?? []),
    },
  } as any;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
  const config = { get: vi.fn().mockReturnValue(undefined) } as any; // TTL default 300s
  return { service: new PrintService(prisma, audit, config), prisma, audit };
};

describe('PrintService.ack (transições QUEUED→PRINTED/FAILED)', () => {
  it('QUEUED → PRINTED: update condicional atômico + devolve o job', async () => {
    const { service, prisma } = make();
    const dto = await service.ack('j1', { result: PrintJobStatus.PRINTED });
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'j1', status: 'QUEUED' } }),
    );
    expect(dto.status).toBe('PRINTED');
  });

  it('re-ACK do MESMO resultado é idempotente (job já PRINTED + ack PRINTED → 200)', async () => {
    const { service } = make({ updatedCount: 0 }); // não estava mais QUEUED
    const dto = await service.ack('j1', { result: PrintJobStatus.PRINTED });
    expect(dto.status).toBe('PRINTED');
  });

  it('resultado divergente do estado terminal → 409 (PRINTED nunca vira FAILED)', async () => {
    const { service } = make({ updatedCount: 0 });
    await expect(service.ack('j1', { result: PrintJobStatus.FAILED })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('job inexistente → 404', async () => {
    const { service } = make({ updatedCount: 0, row: null });
    await expect(service.ack('nope', { result: PrintJobStatus.PRINTED })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('PrintService.expireOverdue (policy CupomExpirado — RB-051)', () => {
  it('QUEUED além do TTL → EXPIRED + audit PRINT_JOB_EXPIRED por cupom', async () => {
    const { service, prisma, audit } = make({
      overdue: [{ id: 'j9', placedById: 'u1', payload: { number: 25 } }],
      updatedCount: 1,
    });
    await service.expireOverdue();
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['j9'] }, status: 'QUEUED' },
        data: expect.objectContaining({ status: 'EXPIRED' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      'PRINT_JOB_EXPIRED',
      expect.objectContaining({ userId: 'u1', entityType: 'PrintJob', entityId: 'j9' }),
    );
  });

  it('sem vencidos → não escreve nem audita', async () => {
    const { service, prisma, audit } = make({ overdue: [] });
    await service.expireOverdue();
    expect(prisma.printJob.updateMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});

describe('PrintService.dismiss (ciência do alerta — só o autor)', () => {
  it('autor dispensa: seta dismissed_at + audita PRINT_ALERT_DISMISSED', async () => {
    const { service, prisma, audit } = make({
      updatedCount: 1,
      row: { ...printedRow, status: 'EXPIRED', dismissedAt: new Date() },
    });
    const dto = await service.dismiss('j1', 'u1');
    expect(prisma.printJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'j1', placedById: 'u1', dismissedAt: null }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      'PRINT_ALERT_DISMISSED',
      expect.objectContaining({ userId: 'u1', entityId: 'j1' }),
    );
    expect(dto.dismissedAt).not.toBeNull();
  });

  it('não-autor / já dispensado / status não-alerta → 404', async () => {
    const { service } = make({ updatedCount: 0 });
    await expect(service.dismiss('j1', 'u2')).rejects.toBeInstanceOf(NotFoundException);
  });
});
