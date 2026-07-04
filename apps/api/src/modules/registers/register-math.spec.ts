import { describe, it, expect } from 'vitest';
import { Prisma } from '../../prisma/client';
import { expectedCash, cashDifference } from './register-math';

const d = (v: string) => new Prisma.Decimal(v);

describe('register-math', () => {
  it('expectedCash = abertura + recebimentos + suprimentos − sangrias (RB-011/052)', () => {
    // abre 100, vende 30 em dinheiro, supre 50, sangra 20 → 160
    expect(expectedCash(d('100.00'), d('30.00'), d('50.00'), d('20.00')).toFixed(2)).toBe('160.00');
  });
  it('expectedCash sem sangria/suprimento (zeros) preserva o comportamento do skeleton', () => {
    expect(expectedCash(d('100.00'), d('30.00'), d('0'), d('0')).toFixed(2)).toBe('130.00');
  });
  it('expectedCash pode ficar negativo (sangria sem teto é risco aceito — auditar, não travar)', () => {
    expect(expectedCash(d('10.00'), d('0'), d('0'), d('25.00')).toFixed(2)).toBe('-15.00');
  });
  it('cashDifference = contado − esperado (sobra positiva)', () => {
    expect(cashDifference(d('135.00'), d('130.00')).toFixed(2)).toBe('5.00');
  });
  it('cashDifference negativa (falta)', () => {
    expect(cashDifference(d('128.00'), d('130.00')).toFixed(2)).toBe('-2.00');
  });
});
