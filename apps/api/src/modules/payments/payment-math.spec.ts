import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { PaymentMethod } from '@teu-jardim/shared';
import { sumTenders, cashPortion, assertTendersMatchTotal } from './payment-math';

const t = (method: PaymentMethod, amount: string) => ({ method, amount: new Prisma.Decimal(amount) });

describe('payment-math', () => {
  it('sumTenders soma as formas (RB-037)', () => {
    expect(sumTenders([t(PaymentMethod.PIX, '50.00'), t(PaymentMethod.CREDIT, '30.00')]).toFixed(2)).toBe('80.00');
  });
  it('cashPortion conta só CASH (entra na gaveta)', () => {
    expect(cashPortion([t(PaymentMethod.PIX, '50.00'), t(PaymentMethod.CASH, '30.00')]).toFixed(2)).toBe('30.00');
    expect(cashPortion([t(PaymentMethod.PIX, '80.00')]).toFixed(2)).toBe('0.00');
  });
  it('assertTendersMatchTotal passa quando soma == total', () => {
    expect(() => assertTendersMatchTotal([t(PaymentMethod.CASH, '42.65')], new Prisma.Decimal('42.65'))).not.toThrow();
  });
  it('assertTendersMatchTotal rejeita quando soma ≠ total (RB-037 → 400)', () => {
    expect(() => assertTendersMatchTotal([t(PaymentMethod.CASH, '40.00')], new Prisma.Decimal('42.65'))).toThrow(BadRequestException);
  });
});
