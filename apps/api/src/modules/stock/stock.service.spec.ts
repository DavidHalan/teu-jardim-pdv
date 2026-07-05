import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StockMovementType } from '@teu-jardim/shared';
import { Prisma } from '../../prisma/client';
import { StockService } from './stock.service';

const D = (v: string) => new Prisma.Decimal(v);

const make = (over: { sums?: any[]; product?: any } = {}) => {
  const tx = {
    product: { findUnique: vi.fn().mockResolvedValue(over.product === undefined ? { id: 'p1', name: 'Suco' } : over.product) },
    stockMovement: {
      create: vi.fn().mockResolvedValue({
        id: 'm1', productId: 'p1', type: 'IN', quantity: D('5'), reason: null, createdAt: new Date(),
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (cb: any) => cb(tx)),
    product: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'p1', name: 'Suco', category: { name: 'Sucos' } },
        { id: 'p2', name: 'Água', category: { name: 'Bebidas' } },
      ]),
    },
    stockMovement: { groupBy: vi.fn().mockResolvedValue(over.sums ?? []) },
  } as any;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
  return { service: new StockService(prisma, audit), tx, audit };
};

describe('StockService (RB-045/046/054)', () => {
  it('saldo derivado = IN − OUT ± ADJUST; produto sem movimento = 0', async () => {
    const { service } = make({
      sums: [
        { productId: 'p1', type: 'IN', _sum: { quantity: D('10') } },
        { productId: 'p1', type: 'OUT', _sum: { quantity: D('3') } },
        { productId: 'p1', type: 'ADJUST', _sum: { quantity: D('-1.5') } },
      ],
    });
    const res = await service.balances();
    expect(res.rows).toEqual([
      expect.objectContaining({ productName: 'Suco', balance: '5.5' }),
      expect.objectContaining({ productName: 'Água', balance: '0' }),
    ]);
  });

  it('movimento grava e audita STOCK_MOVEMENT na tx', async () => {
    const { service, tx, audit } = make();
    await service.registerMovement('p1', StockMovementType.IN, '5', 'admin1');
    expect(tx.stockMovement.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      'STOCK_MOVEMENT',
      expect.objectContaining({ userId: 'admin1', metadata: expect.objectContaining({ type: 'IN' }) }),
      tx,
    );
  });

  it('IN/OUT exigem quantidade > 0; ADJUST exige ≠ 0 e motivo (RB-054); produto inexistente 404', async () => {
    const { service } = make();
    await expect(service.registerMovement('p1', StockMovementType.IN, '0', 'u')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.registerMovement('p1', StockMovementType.OUT, '-2', 'u')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.registerMovement('p1', StockMovementType.ADJUST, '0', 'u', 'x')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.registerMovement('p1', StockMovementType.ADJUST, '-2', 'u')).rejects.toBeInstanceOf(BadRequestException); // sem motivo

    const missing = make({ product: null });
    await expect(missing.service.registerMovement('nope', StockMovementType.IN, '1', 'u')).rejects.toBeInstanceOf(NotFoundException);
  });
});
