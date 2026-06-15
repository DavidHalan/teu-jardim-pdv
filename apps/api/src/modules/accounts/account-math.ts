import { BadRequestException } from '@nestjs/common';
import { ProductType } from '@teu-jardim/shared';
import { Prisma } from '../../generated/prisma/client';

export interface LineInput {
  type: ProductType;
  price: Prisma.Decimal; // por unidade (UNIT) ou por kg (WEIGHED)
  quantity?: number;
  weightGrams?: number;
}

export interface ComputedLine {
  quantity: number;
  weightGrams: number | null;
  unitPrice: Prisma.Decimal; // snapshot (RB-019)
  lineTotal: Prisma.Decimal;
}

/**
 * Valor da linha (RB-014, RB-047) — Decimal puro, nunca float.
 * UNIT:    lineTotal = price × quantity.
 * WEIGHED: kg = grams/1000; lineTotal = (price/kg) × kg (453 g → 0,453 kg → 0,453 × preço).
 */
export function computeLine(input: LineInput): ComputedLine {
  if (input.type === ProductType.WEIGHED) {
    const grams = input.weightGrams;
    if (grams === undefined || !Number.isInteger(grams) || grams <= 0) {
      throw new BadRequestException('Peso (em gramas) deve ser um inteiro positivo.');
    }
    const lineTotal = input.price.mul(grams).div(1000).toDecimalPlaces(2);
    return { quantity: 1, weightGrams: grams, unitPrice: input.price, lineTotal };
  }

  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new BadRequestException('Quantidade deve ser um inteiro positivo.');
  }
  const lineTotal = input.price.mul(quantity).toDecimalPlaces(2);
  return { quantity, weightGrams: null, unitPrice: input.price, lineTotal };
}
