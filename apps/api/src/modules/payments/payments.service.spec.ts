import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { PaymentsService } from './payments.service';

const reg = { id: 'r1', businessSessionId: 's1', operatorId: 'u1', status: 'OPEN' };
const accountOpen = (id: string, total: string) => ({ id, status: 'OPEN', businessSessionId: 's1', total: new Prisma.Decimal(total) });

const make = (over: { accounts?: any[]; registerThrows?: boolean; payment?: any; occupied?: any } = {}) => {
  const registers = {
    getCurrentRowForOperatorOrThrow: over.registerThrows
      ? vi.fn().mockRejectedValue(new ConflictException('sem caixa'))
      : vi.fn().mockResolvedValue(reg),
  } as any;
  // tx mínimo: os testes cobrem as validações que disparam antes da persistência.
  const tx = {
    account: {
      findMany: vi.fn().mockResolvedValue(over.accounts ?? [accountOpen('a1', '42.65')]),
      findFirst: vi.fn().mockResolvedValue(over.occupied ?? null),
    },
    payment: { findUnique: vi.fn().mockResolvedValue(over.payment ?? null) },
  } as any;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
  // Fake do IdempotencyService: executa o run direto com o tx (dedup coberto no e2e).
  const idempotency = { execute: vi.fn(({ run }: any) => run(tx)) } as any;
  return { service: new PaymentsService({} as any, audit, registers, idempotency), tx, registers };
};

/** Payment SETTLED de grupo com 1 conta PAID (comanda 7) na operação s1. */
const settledPayment = (over: Partial<{ status: string; businessSessionId: string }> = {}) => ({
  id: 'p1',
  accountGroupId: 'g1',
  registerId: 'r1',
  total: new Prisma.Decimal('42.65'),
  status: over.status ?? 'SETTLED',
  createdAt: new Date(),
  tenders: [{ method: 'CASH', amount: new Prisma.Decimal('42.65') }],
  accountGroup: {
    id: 'g1',
    businessSessionId: over.businessSessionId ?? 's1',
    members: [
      {
        accountGroupId: 'g1',
        accountId: 'a1',
        account: { id: 'a1', tabType: 'COMANDA', number: 7, status: 'PAID', businessSessionId: over.businessSessionId ?? 's1' },
      },
    ],
  },
});

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

describe('PaymentsService.reverse (guards RB-048/050)', () => {
  it('rejeita quem não tem caixa aberto (409)', async () => {
    const { service } = make({ registerThrows: true });
    await expect(service.reverse('p1', 'erro de cobrança', 'u1', 'k1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('pagamento inexistente → 404', async () => {
    const { service } = make({ payment: null });
    await expect(service.reverse('p1', 'erro de cobrança', 'u1', 'k1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('só SETTLED estorna: REVERSED de novo → 409 (REVERSED→SETTLED proibido)', async () => {
    const { service } = make({ payment: settledPayment({ status: 'REVERSED' }) });
    await expect(service.reverse('p1', 'de novo', 'u1', 'k1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('pagamento de outra operação → 409 (RB-048: só operação OPEN corrente)', async () => {
    const { service } = make({ payment: settledPayment({ businessSessionId: 's0' }) });
    await expect(service.reverse('p1', 'operação antiga', 'u1', 'k1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('número já ocupado por outra conta OPEN → 409 tudo-ou-nada (RB-050)', async () => {
    const { service } = make({
      payment: settledPayment(),
      occupied: { id: 'a99', tabType: 'COMANDA', number: 7, status: 'OPEN' },
    });
    await expect(service.reverse('p1', 'número reocupado', 'u1', 'k1')).rejects.toBeInstanceOf(ConflictException);
  });
});
