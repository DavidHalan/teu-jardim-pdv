import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '@teu-jardim/shared';
import { Prisma } from '../../generated/prisma/client';

export interface TenderDecimal {
  method: PaymentMethod;
  amount: Prisma.Decimal;
}

/** Soma das formas de pagamento (RB-037). */
export function sumTenders(tenders: TenderDecimal[]): Prisma.Decimal {
  return tenders.reduce((acc, t) => acc.add(t.amount), new Prisma.Decimal(0)).toDecimalPlaces(2);
}

/** Parcela em dinheiro (única que entra na gaveta → vira SALE_RECEIPT). */
export function cashPortion(tenders: TenderDecimal[]): Prisma.Decimal {
  return tenders
    .filter((t) => t.method === PaymentMethod.CASH)
    .reduce((acc, t) => acc.add(t.amount), new Prisma.Decimal(0))
    .toDecimalPlaces(2);
}

/** A soma dos tenders deve ser exatamente o total (RB-037). */
export function assertTendersMatchTotal(tenders: TenderDecimal[], total: Prisma.Decimal): void {
  if (!sumTenders(tenders).equals(total)) {
    throw new BadRequestException('A soma das formas de pagamento deve ser igual ao total da conta.');
  }
}
