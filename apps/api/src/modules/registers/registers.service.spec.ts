import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { RegistersService } from './registers.service';

const sessionRow = { id: 's1', status: 'OPEN' };
// Stub de Prisma.Decimal — o service só usa .toFixed(2).
const decimal = (v: string) => ({ toFixed: (_n: number) => v });
const createdRegister = {
  id: 'r1', businessSessionId: 's1', operatorId: 'u1', openingAmount: decimal('100.00'),
  status: 'OPEN', openedAt: new Date('2026-06-14T12:05:00Z'), closedAt: null,
};

const make = (over: { register?: any; sessions?: any; businessSession?: any } = {}) => {
  const prisma = {
    businessSession: { findFirst: vi.fn().mockResolvedValue(sessionRow), ...(over.businessSession ?? {}) },
    register: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(createdRegister),
      ...(over.register ?? {}),
    },
  } as any;
  const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
  const sessions = { getCurrentRowOrThrow: vi.fn().mockResolvedValue(sessionRow), ...(over.sessions ?? {}) } as any;
  return { service: new RegistersService(prisma, audit, sessions, {} as any), prisma, audit, sessions };
};

describe('RegistersService.openRegister', () => {
  it('opens a register for the operator and audits REGISTER_OPEN (RB-009)', async () => {
    const { service, prisma, audit } = make();
    const dto = await service.openRegister('100.00', 'u1');

    expect(prisma.register.create).toHaveBeenCalledWith({
      data: { businessSessionId: 's1', operatorId: 'u1', openingAmount: '100.00' },
    });
    expect(audit.log).toHaveBeenCalledWith('REGISTER_OPEN', {
      userId: 'u1', entityType: 'Register', entityId: 'r1', metadata: { openingAmount: '100.00' },
    });
    expect(dto).toEqual({
      id: 'r1', businessSessionId: 's1', operatorId: 'u1', openingAmount: '100.00',
      status: 'OPEN', openedAt: '2026-06-14T12:05:00.000Z', closedAt: null,
    });
  });

  it('rejects a negative opening amount (RB-009)', async () => {
    const { service } = make();
    await expect(service.openRegister('-1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when no operation is open (RB-008)', async () => {
    const { service } = make({
      sessions: { getCurrentRowOrThrow: vi.fn().mockRejectedValue(new ConflictException('x')) },
    });
    await expect(service.openRegister('100.00', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a second register for the same operator (RB-009a)', async () => {
    const { service } = make({
      register: { findFirst: vi.fn().mockResolvedValue({ id: 'r0', status: 'OPEN' }) },
    });
    await expect(service.openRegister('100.00', 'u1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('RegistersService.getCurrentForOperator', () => {
  it('returns null when no operation is open', async () => {
    const { service } = make({ businessSession: { findFirst: vi.fn().mockResolvedValue(null) } });
    expect(await service.getCurrentForOperator('u1')).toBeNull();
  });
});

import { Prisma } from '../../prisma/client';

// Só os guards (ambos disparam ANTES do tx.register.update, então o mock fica simples).
// O cálculo esperado/diferença já está coberto pelo register-math (Task 2) e pelo e2e (Task 8).
describe('RegistersService.closeRegister (guards)', () => {
  const openRegister = { id: 'r1', businessSessionId: 's1', operatorId: 'u1', openingAmount: new Prisma.Decimal('100.00'), status: 'OPEN' };

  // `'register' in over` distingue "não passou" de "passou null" (null ?? default daria o default).
  const makeClose = (over: { openAccounts?: number; register?: any } = {}) => {
    const register = 'register' in over ? over.register : openRegister;
    const tx = {
      businessSession: { findFirst: vi.fn().mockResolvedValue({ id: 's1', status: 'OPEN' }) },
      register: { findFirst: vi.fn().mockResolvedValue(register), update: vi.fn().mockResolvedValue({}) },
      account: { count: vi.fn().mockResolvedValue(over.openAccounts ?? 0) },
      cashMovement: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal('0') } }) },
    };
    // Fake do IdempotencyService: executa o run direto com o tx (dedup coberto no e2e).
    const idempotency = { execute: vi.fn(({ run }: any) => run(tx)) } as any;
    return { service: new RegistersService({} as any, { log: vi.fn() } as any, {} as any, idempotency) };
  };

  it('bloqueia o fechamento se houver conta OPEN na operação (RB-012/012a → 409)', async () => {
    const { service } = makeClose({ openAccounts: 1 });
    await expect(service.closeRegister('u1', '130.00', 'k1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('fechamento agrega os 3 tipos: esperado = abertura + recebimentos + suprimentos − sangrias (RB-052)', async () => {
    const tx = {
      businessSession: { findFirst: vi.fn().mockResolvedValue({ id: 's1', status: 'OPEN' }) },
      register: {
        findFirst: vi.fn().mockResolvedValue(openRegister),
        update: vi.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ ...openRegister, ...data, closedAt: new Date('2026-07-04T20:00:00Z') })),
      },
      account: { count: vi.fn().mockResolvedValue(0) },
      cashMovement: {
        groupBy: vi.fn().mockResolvedValue([
          { type: 'SALE_RECEIPT', _sum: { amount: new Prisma.Decimal('30.00') } },
          { type: 'SUPPLY', _sum: { amount: new Prisma.Decimal('50.00') } },
          { type: 'WITHDRAWAL', _sum: { amount: new Prisma.Decimal('20.00') } },
        ]),
      },
    };
    const idempotency = { execute: vi.fn(({ run }: any) => run(tx)) } as any;
    const service = new RegistersService({} as any, { log: vi.fn() } as any, {} as any, idempotency);

    const closed = await service.closeRegister('u1', '160.00', 'k1');
    expect(closed.expectedAmount).toBe('160.00'); // 100 + 30 + 50 − 20
    expect(closed.difference).toBe('0.00');
  });

  it('rejeita fechar quando o operador não tem caixa aberto (409)', async () => {
    const { service } = makeClose({ register: null });
    await expect(service.closeRegister('u1', '130.00', 'k1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('RegistersService sangria/suprimento (RB-052)', () => {
  const openRegister = { id: 'r1', businessSessionId: 's1', operatorId: 'u1', status: 'OPEN' };

  const makeMove = (over: { register?: any } = {}) => {
    const register = 'register' in over ? over.register : openRegister;
    const created = {
      id: 'm1', type: 'WITHDRAWAL', amount: new Prisma.Decimal('30.00'),
      reason: 'troco banco', createdAt: new Date('2026-07-04T18:00:00Z'),
    };
    const tx = {
      businessSession: { findFirst: vi.fn().mockResolvedValue({ id: 's1', status: 'OPEN' }) },
      register: { findFirst: vi.fn().mockResolvedValue(register) },
      cashMovement: { create: vi.fn().mockResolvedValue(created) },
    };
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as any;
    const idempotency = { execute: vi.fn(({ run }: any) => run(tx)) } as any;
    const service = new RegistersService({} as any, audit, {} as any, idempotency);
    return { service, tx, audit };
  };

  it('registra sangria com valor+motivo e audita CASH_WITHDRAWAL na tx', async () => {
    const { service, tx, audit } = makeMove();
    const dto = await service.registerWithdrawal('u1', '30.00', 'troco banco', 'k1');

    expect(tx.cashMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ registerId: 'r1', type: 'WITHDRAWAL', reason: 'troco banco', userId: 'u1' }),
    });
    expect(audit.log).toHaveBeenCalledWith(
      'CASH_WITHDRAWAL',
      expect.objectContaining({ userId: 'u1', entityType: 'CashMovement', entityId: 'm1', reason: 'troco banco' }),
      tx,
    );
    expect(dto).toEqual({
      id: 'm1', type: 'WITHDRAWAL', amount: '30.00', reason: 'troco banco',
      createdAt: '2026-07-04T18:00:00.000Z',
    });
  });

  it('rejeita valor zero/negativo (RB-052 → 400) sem tocar no banco', async () => {
    const { service, tx } = makeMove();
    await expect(service.registerWithdrawal('u1', '0', 'x', 'k1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.registerSupply('u1', '-5', 'x', 'k1')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.cashMovement.create).not.toHaveBeenCalled();
  });

  it('rejeita sem caixa aberto (409)', async () => {
    const { service } = makeMove({ register: null });
    await expect(service.registerSupply('u1', '10.00', 'fundo', 'k1')).rejects.toBeInstanceOf(ConflictException);
  });
});
