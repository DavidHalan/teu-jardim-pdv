import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrintJobStatus } from '@teu-jardim/shared';
import { PrintService } from './print.service';

const queuedRow = {
  id: 'j1',
  accountId: 'a1',
  stationId: 'st1',
  batchId: 'k1',
  status: 'PRINTED',
  payload: {},
  error: null,
  createdAt: new Date('2026-07-04T12:00:00Z'),
  ackedAt: new Date('2026-07-04T12:00:05Z'),
};

const make = (over: { updatedCount?: number; row?: any } = {}) => {
  const prisma = {
    printJob: {
      updateMany: vi.fn().mockResolvedValue({ count: over.updatedCount ?? 1 }),
      findUnique: vi.fn().mockResolvedValue(over.row === undefined ? queuedRow : over.row),
    },
  } as any;
  return { service: new PrintService(prisma), prisma };
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
