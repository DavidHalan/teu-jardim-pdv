import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { PaymentsService } from './payments.service';

const reg = { id: 'r1', businessSessionId: 's1', operatorId: 'u1', status: 'OPEN' };
const accountOpen = (id: string, total: string) => ({ id, status: 'OPEN', businessSessionId: 's1', total: new Prisma.Decimal(total) });

const make = (over: { accounts?: any[]; registerThrows?: boolean } = {}) => {
  const registers = {
    getCurrentRowForOperatorOrThrow: over.registerThrows
      ? vi.fn().mockRejectedValue(new ConflictException('sem caixa'))
      : vi.fn().mockResolvedValue(reg),
  } as any;
  // tx mínimo: os testes cobrem as validações que disparam antes da persistência.
  const tx = {
    account: { findMany: vi.fn().mockResolvedValue(over.accounts ?? [accountOpen('a1', '42.65')]) },
  } as any;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
  // Fake do IdempotencyService: executa o run direto com o tx (dedup coberto no e2e).
  const idempotency = { execute: vi.fn(({ run }: any) => run(tx)) } as any;
  return { service: new PaymentsService(audit, registers, idempotency), tx, registers };
};

describe('PaymentsService.pay (validações pré-persistência)', () => {
  it('rejeita quando o operador não tem caixa aberto (409)', async () => {
    const { service } = make({ registerThrows: true });
    await expect(service.pay(['a1'], [{ method: 'CASH' as any, amount: '42.65' }], 'u1', 'k1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejeita conta inexistente/não OPEN (409)', async () => {
    const { service } = make({ accounts: [{ id: 'a1', status: 'PAID', businessSessionId: 's1', total: new Prisma.Decimal('10') }] });
    await expect(service.pay(['a1'], [{ method: 'CASH' as any, amount: '10.00' }], 'u1', 'k1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejeita soma de tenders ≠ total (RB-037 → 400)', async () => {
    const { service } = make({ accounts: [accountOpen('a1', '42.65')] });
    await expect(service.pay(['a1'], [{ method: 'CASH' as any, amount: '40.00' }], 'u1', 'k1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
