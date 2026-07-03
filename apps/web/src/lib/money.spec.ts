import { describe, it, expect } from 'vitest';
import { formatBRL } from './money';

// Normaliza o separador (ICU usa NBSP U+00A0 ou narrow-NBSP U+202F entre "R$" e o número).
const norm = (s: string): string => s.replace(/[\u00A0\u202F]/g, ' ');

describe('formatBRL', () => {
  it('formats a canonical decimal string as BRL', () => {
    expect(norm(formatBRL('150.00'))).toBe('R$ 150,00');
  });
  it('formats a number as BRL', () => {
    expect(norm(formatBRL(1234.5))).toBe('R$ 1.234,50');
  });
  it('falls back to zero for non-numeric input', () => {
    expect(norm(formatBRL('abc'))).toBe('R$ 0,00');
  });
});
