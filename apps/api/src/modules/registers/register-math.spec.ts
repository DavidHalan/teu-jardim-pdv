import { describe, it, expect } from 'vitest';
import { Prisma } from '../../generated/prisma/client';
import { expectedCash, cashDifference } from './register-math';

const d = (v: string) => new Prisma.Decimal(v);

describe('register-math', () => {
  it('expectedCash = abertura + recebimentos em dinheiro', () => {
    expect(expectedCash(d('100.00'), d('30.00')).toFixed(2)).toBe('130.00');
  });
  it('cashDifference = contado − esperado (sobra positiva)', () => {
    expect(cashDifference(d('135.00'), d('130.00')).toFixed(2)).toBe('5.00');
  });
  it('cashDifference negativa (falta)', () => {
    expect(cashDifference(d('128.00'), d('130.00')).toFixed(2)).toBe('-2.00');
  });
});
