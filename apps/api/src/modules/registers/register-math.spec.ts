import { describe, it, expect } from 'vitest';
import { Prisma } from '../../prisma/client';
import { expectedCash, cashDifference } from './register-math';

const d = (v: string) => new Prisma.Decimal(v);

describe('register-math', () => {
  it('expectedCash = abertura + recebimentos + suprimentos − sangrias − estornos (RB-011/052/049)', () => {
    // abre 100, vende 30 em dinheiro, supre 50, sangra 20, estorna 10 → 150
    expect(
      expectedCash(d('100.00'), d('30.00'), d('50.00'), d('20.00'), d('10.00')).toFixed(2),
    ).toBe('150.00');
  });
  it('expectedCash sem sangria/suprimento/estorno (zeros) preserva o comportamento do skeleton', () => {
    expect(expectedCash(d('100.00'), d('30.00'), d('0'), d('0'), d('0')).toFixed(2)).toBe('130.00');
  });
  it('expectedCash pode ficar negativo (sangria sem teto é risco aceito — auditar, não travar)', () => {
    expect(expectedCash(d('10.00'), d('0'), d('0'), d('25.00'), d('0')).toFixed(2)).toBe('-15.00');
  });
  it('estorno em dinheiro sai da gaveta (RB-049): venda 30 estornada zera o efeito no esperado', () => {
    expect(expectedCash(d('100.00'), d('30.00'), d('0'), d('0'), d('30.00')).toFixed(2)).toBe('100.00');
  });
  it('cashDifference = contado − esperado (sobra positiva)', () => {
    expect(cashDifference(d('135.00'), d('130.00')).toFixed(2)).toBe('5.00');
  });
  it('cashDifference negativa (falta)', () => {
    expect(cashDifference(d('128.00'), d('130.00')).toFixed(2)).toBe('-2.00');
  });
});
