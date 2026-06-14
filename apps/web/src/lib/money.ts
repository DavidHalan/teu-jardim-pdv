/** Formata uma string decimal canônica (ex.: "150.00") ou número como moeda BRL. */
export function formatBRL(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(n) ? n : 0,
  );
}
