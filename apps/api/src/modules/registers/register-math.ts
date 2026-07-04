import { Prisma } from '../../prisma/client';

/**
 * Esperado na gaveta (RB-011/052) = abertura + recebimentos em dinheiro
 * + suprimentos − sangrias. Pode ficar negativo — sangria sem teto é risco
 * aceito (dono, 2026-06-19): auditar, não travar.
 */
export function expectedCash(
  opening: Prisma.Decimal,
  cashReceipts: Prisma.Decimal,
  cashSupplies: Prisma.Decimal,
  cashWithdrawals: Prisma.Decimal,
): Prisma.Decimal {
  return opening.add(cashReceipts).add(cashSupplies).sub(cashWithdrawals).toDecimalPlaces(2);
}

/** Diferença do fechamento = contado − esperado (negativo = falta). */
export function cashDifference(counted: Prisma.Decimal, expected: Prisma.Decimal): Prisma.Decimal {
  return counted.sub(expected).toDecimalPlaces(2);
}
