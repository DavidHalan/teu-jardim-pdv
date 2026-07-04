// UUID v4 p/ Idempotency-Key (uma por intenção — ADR-0026 §6).
// crypto.randomUUID exige secure context; o kiosk roda em HTTP na LAN até o TLS (S-1,
// hardening de deploy) → fallback com getRandomValues (disponível em contexto inseguro).
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // versão 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
