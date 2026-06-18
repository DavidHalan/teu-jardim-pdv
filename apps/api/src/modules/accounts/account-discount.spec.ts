import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { DiscountType } from '@teu-jardim/shared';
import { computeDiscountTotal } from './account-discount';

const d = (v: string) => new Prisma.Decimal(v);

describe('computeDiscountTotal (RB-027/028)', () => {
  it('PERCENT: 10% de R$42,65 = R$4,27', () => {
    expect(computeDiscountTotal(d('42.65'), DiscountType.PERCENT, d('10')).toFixed(2)).toBe('4.27');
  });
  it('FIXED: R$5,00', () => {
    expect(computeDiscountTotal(d('42.65'), DiscountType.FIXED, d('5.00')).toFixed(2)).toBe('5.00');
  });
  it('FIXED maior que o subtotal é limitado ao subtotal (total não fica negativo)', () => {
    expect(computeDiscountTotal(d('42.65'), DiscountType.FIXED, d('100.00')).toFixed(2)).toBe('42.65');
  });
  it('PERCENT > 100 → 400', () => {
    expect(() => computeDiscountTotal(d('42.65'), DiscountType.PERCENT, d('120'))).toThrow(BadRequestException);
  });
  it('valor negativo → 400', () => {
    expect(() => computeDiscountTotal(d('42.65'), DiscountType.FIXED, d('-1'))).toThrow(BadRequestException);
  });
});
