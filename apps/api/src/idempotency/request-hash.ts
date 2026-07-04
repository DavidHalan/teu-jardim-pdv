import { createHash } from 'node:crypto';

// Hash canônico do request (coluna request_hash — ADR-0025): detecta reuso de
// Idempotency-Key com payload diferente. Chaves de objeto ordenadas recursivamente —
// a mesma intenção serializada com ordem de campos diferente tem o mesmo hash.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = canonical(source[k]);
        return acc;
      }, {});
  }
  return value;
}

export function hashRequest(request: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(request))).digest('hex');
}
