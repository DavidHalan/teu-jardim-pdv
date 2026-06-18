import type { PaymentMethod, PaymentTenderInput } from '@teu-jardim/shared';

/** Linha de forma de pagamento em montagem (UI). `amount` em string (pode vir "10,00"). */
export interface TenderRow {
  method: PaymentMethod;
  amount: string;
}

/** "10,00" | "10.00" | "10" → centavos inteiros (sem float). */
function toCents(raw: string): number {
  const t = raw.trim().replace(/\./g, '').replace(',', '.');
  const norm = raw.includes(',') ? t : raw.trim();
  const [int, frac = ''] = norm.split('.');
  const cents = `${frac}00`.slice(0, 2);
  return Number(int || '0') * 100 + Number(cents || '0');
}

function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Falta a pagar = total − Σ tenders (string decimal canônica). */
export function remaining(total: string, rows: TenderRow[]): string {
  const sum = rows.reduce((acc, r) => acc + toCents(r.amount), 0);
  return fromCents(toCents(total) - sum);
}

/** Soma dos tenders == total exato (RB-037). */
export function isExactlyPaid(total: string, rows: TenderRow[]): boolean {
  const sum = rows.reduce((acc, r) => acc + toCents(r.amount), 0);
  return sum === toCents(total);
}

/** Normaliza para o request da API (ponto decimal). */
export function toTenderRequest(rows: TenderRow[]): PaymentTenderInput[] {
  return rows.map((r) => ({ method: r.method, amount: fromCents(toCents(r.amount)) }));
}
