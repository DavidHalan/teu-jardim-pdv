import { BadRequestException } from '@nestjs/common';
import { DiscountType } from '@teu-jardim/shared';
import { Prisma } from '../../generated/prisma/client';

/**
 * discountTotal a partir do subtotal (RB-027/028). PERCENT: subtotal×value/100; FIXED: value.
 * Limitado ao subtotal (o total nunca fica negativo).
 */
export function computeDiscountTotal(
  subtotal: Prisma.Decimal,
  type: DiscountType,
  value: Prisma.Decimal,
): Prisma.Decimal {
  if (value.lessThan(0)) throw new BadRequestException('Desconto não pode ser negativo.');

  let discountTotal: Prisma.Decimal;
  if (type === DiscountType.PERCENT) {
    if (value.greaterThan(100)) {
      throw new BadRequestException('Percentual de desconto não pode passar de 100%.');
    }
    discountTotal = subtotal.mul(value).div(100).toDecimalPlaces(2);
  } else {
    discountTotal = value.toDecimalPlaces(2);
  }

  return discountTotal.greaterThan(subtotal) ? subtotal : discountTotal;
}
