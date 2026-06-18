import { describe, it, expect } from 'vitest';
import { PaymentMethod } from '@teu-jardim/shared';
import { remaining, isExactlyPaid, toTenderRequest, type TenderRow } from './tenders';

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
});
