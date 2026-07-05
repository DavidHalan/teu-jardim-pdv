import { describe, it, expect } from 'vitest';
import { PaymentMethod } from '@teu-jardim/shared';
import { remaining, isExactlyPaid, sumTotals, toTenderRequest, type TenderRow } from './tenders';

const rows: TenderRow[] = [
  { method: PaymentMethod.PIX, amount: '15.00' },
  { method: PaymentMethod.CASH, amount: '10.00' },
];

describe('tenders', () => {
  it('remaining = total − soma (em centavos, sem float)', () => {
    expect(remaining('25.00', rows)).toBe('0.00');
    expect(remaining('30.00', rows)).toBe('5.00');
  });
  it('isExactlyPaid quando soma == total', () => {
    expect(isExactlyPaid('25.00', rows)).toBe(true);
    expect(isExactlyPaid('25.01', rows)).toBe(false);
  });
  it('toTenderRequest normaliza valores ("10,00" → "10.00")', () => {
    expect(toTenderRequest([{ method: PaymentMethod.CASH, amount: '10,00' }])).toEqual([{ method: PaymentMethod.CASH, amount: '10.00' }]);
  });
  it('sumTotals soma totais-com-desconto do grupo (RB-036) em centavos, sem float', () => {
    expect(sumTotals(['42.65', '12.00'])).toBe('54.65');
    expect(sumTotals(['0.10', '0.20'])).toBe('0.30'); // 0.1+0.2 float quebraria
    expect(sumTotals(['25.00'])).toBe('25.00');
  });
});
