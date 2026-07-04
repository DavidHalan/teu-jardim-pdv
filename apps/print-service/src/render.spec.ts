import { describe, it, expect } from 'vitest';
import { PrintJobStatus, TabType } from '@teu-jardim/shared';
import type { PrintJobPayload } from '@teu-jardim/shared';
import { escposEncode, formatCoupon } from './render';

void PrintJobStatus; // shared importado como valor — garante interop CJS no runtime do serviço

const payload: PrintJobPayload = {
  tabType: TabType.COMANDA,
  number: 61,
  stationName: 'Sucos',
  items: [
    { name: 'Suco Verde', quantity: 2, weightGrams: null, observations: ['Sem açúcar', 'Com hortelã'] },
    { name: 'Self Service (kg)', quantity: 1, weightGrams: 350, observations: [] },
  ],
  placedBy: 'Garçom',
  placedAt: '2026-07-04T19:30:00.000Z',
};

describe('formatCoupon', () => {
  it('cabeçalho da estação + conta + itens com quantidade/peso e observações, sem acento', () => {
    const text = formatCoupon(payload);
    expect(text).toContain('SUCOS');
    expect(text).toContain('COMANDA 61');
    expect(text).toContain('2x Suco Verde');
    expect(text).toContain('   - Sem acucar'); // normalizado p/ ASCII
    expect(text).toContain('   - Com hortela');
    expect(text).toContain('350g Self Service (kg)');
    expect(text).toContain('por Garcom');
  });

  it('cabe em 32 colunas (MP-100S TH fonte A)', () => {
    for (const l of formatCoupon(payload).split('\n')) {
      expect(l.length).toBeLessThanOrEqual(32);
    }
  });
});

describe('escposEncode', () => {
  it('começa com ESC @ (init), número em dobro, termina com partial cut', () => {
    const buf = escposEncode(payload);
    expect([...buf.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect(buf.includes(Buffer.from([0x1d, 0x21, 0x11]))).toBe(true); // double size on
    expect(buf.includes(Buffer.from([0x1d, 0x56, 0x42, 0x00]))).toBe(true); // cut
  });
});
