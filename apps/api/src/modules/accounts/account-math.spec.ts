import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../prisma/client';
import { ProductType } from '@teu-jardim/shared';
import { computeLine } from './account-math';

const dec = (v: string) => new Prisma.Decimal(v);

describe('computeLine', () => {
  it('WEIGHED: 453 g × R$50,00/kg → 0,453 kg → R$22,65 (RB-014, exemplo do BRD)', () => {
    const line = computeLine({ type: ProductType.WEIGHED, price: dec('50.00'), weightGrams: 453 });
    expect(line.lineTotal.toFixed(2)).toBe('22.65');
    expect(line.unitPrice.toFixed(2)).toBe('50.00');
    expect(line.quantity).toBe(1);
    expect(line.weightGrams).toBe(453);
  });

  it('UNIT: R$8,00 × 3 → R$24,00; sem float', () => {
    const line = computeLine({ type: ProductType.UNIT, price: dec('8.00'), quantity: 3 });
    expect(line.lineTotal.toFixed(2)).toBe('24.00');
    expect(line.weightGrams).toBeNull();
    expect(line.quantity).toBe(3);
  });

  it('UNIT: quantidade default = 1', () => {
    const line = computeLine({ type: ProductType.UNIT, price: dec('5.00') });
    expect(line.lineTotal.toFixed(2)).toBe('5.00');
    expect(line.quantity).toBe(1);
  });

  it('WEIGHED sem peso → 400', () => {
    expect(() => computeLine({ type: ProductType.WEIGHED, price: dec('50.00') })).toThrow(
      BadRequestException,
    );
  });

  it('WEIGHED com peso não-positivo → 400', () => {
    expect(() =>
      computeLine({ type: ProductType.WEIGHED, price: dec('50.00'), weightGrams: 0 }),
    ).toThrow(BadRequestException);
  });

  it('UNIT com quantidade não-positiva → 400', () => {
    expect(() =>
      computeLine({ type: ProductType.UNIT, price: dec('5.00'), quantity: 0 }),
    ).toThrow(BadRequestException);
  });
});
