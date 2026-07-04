import { describe, it, expect } from 'vitest';
import { hashRequest } from './request-hash';

describe('hashRequest', () => {
  it('mesmo payload → mesmo hash (determinístico)', () => {
    const a = hashRequest({ accountIds: ['a1'], tenders: [{ method: 'CASH', amount: '10.00' }] });
    const b = hashRequest({ accountIds: ['a1'], tenders: [{ method: 'CASH', amount: '10.00' }] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ordem de chaves de objeto não muda o hash (canônico, inclusive aninhado)', () => {
    const a = hashRequest({ x: 1, y: { b: 2, a: 3 } });
    const b = hashRequest({ y: { a: 3, b: 2 }, x: 1 });
    expect(a).toBe(b);
  });

  it('payload diferente → hash diferente', () => {
    expect(hashRequest({ amount: '10.00' })).not.toBe(hashRequest({ amount: '10.01' }));
  });

  it('ordem de ARRAY é significativa (itens de pedido são posicionais)', () => {
    expect(hashRequest({ items: [1, 2] })).not.toBe(hashRequest({ items: [2, 1] }));
  });
});
