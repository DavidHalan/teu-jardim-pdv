import { Prisma } from '../../prisma/client';

/** Esperado na gaveta = abertura + recebimentos em dinheiro (sangria/suprimento = fase futura). */
export function expectedCash(opening: Prisma.Decimal, cashReceipts: Prisma.Decimal): Prisma.Decimal {
  return opening.add(cashReceipts).toDecimalPlaces(2);
}

/** Diferença do fechamento = contado − esperado (negativo = falta). */
export function cashDifference(counted: Prisma.Decimal, expected: Prisma.Decimal): Prisma.Decimal {
  return counted.sub(expected).toDecimalPlaces(2);
}
