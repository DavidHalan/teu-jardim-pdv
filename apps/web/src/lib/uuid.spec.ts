import { describe, it, expect } from 'vitest';
import { uuid } from './uuid';

describe('uuid', () => {
  it('gera UUID v4 válido e único por chamada', () => {
    const a = uuid();
    const b = uuid();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});
