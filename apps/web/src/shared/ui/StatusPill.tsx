import type { CSSProperties } from 'react';

/**
 * Pílula de status do design system (DESIGN.md "status-pill"): par **cor + rótulo**,
 * nunca matiz só. `dot` adiciona o ponto colorido (estado por vislumbre). Tons mapeiam
 * a paleta semântica; `brand` = estado "aberto/ativo" da operação (oliva), não status de item.
 */
type Tone = 'brand' | 'ready' | 'cooking' | 'pending' | 'danger' | 'info';

interface StatusPillProps {
  label: string;
  tone?: Tone;
  dot?: boolean;
}

export function StatusPill({ label, tone = 'brand', dot = true }: StatusPillProps): React.JSX.Element {
  const t = tones[tone];
  return (
    <span style={{ ...base, color: t.text, background: t.pale }}>
      {dot ? <span aria-hidden="true" style={{ ...dotStyle, background: t.dot }} /> : null}
      {label}
    </span>
  );
}

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '7px',
  width: 'fit-content',
  fontSize: 'var(--tj-fs-caption)',
  fontWeight: 600,
  padding: '4px 12px 4px 10px',
  borderRadius: 'var(--tj-radius-pill)',
};

const dotStyle: CSSProperties = { width: '8px', height: '8px', borderRadius: '9999px' };

// Nomes de tone preservam a API das telas; valores migram para os tokens v2 (tint + texto).
const tones: Record<Tone, { text: string; pale: string; dot: string }> = {
  brand: { text: 'var(--tj-accent-deep)', pale: 'var(--tj-accent-tint)', dot: 'var(--tj-accent)' },
  ready: { text: 'var(--tj-ok)', pale: 'var(--tj-ok-tint)', dot: 'var(--tj-ok)' },
  cooking: { text: 'var(--tj-warn)', pale: 'var(--tj-warn-tint)', dot: 'var(--tj-warn)' },
  pending: { text: 'var(--tj-body)', pale: 'var(--tj-surface-2)', dot: 'var(--tj-muted)' },
  danger: { text: 'var(--tj-danger)', pale: 'var(--tj-danger-tint)', dot: 'var(--tj-danger)' },
  info: { text: 'var(--tj-info)', pale: 'var(--tj-info-tint)', dot: 'var(--tj-info)' },
};
