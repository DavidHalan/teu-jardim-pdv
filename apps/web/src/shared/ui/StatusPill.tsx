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

const tones: Record<Tone, { text: string; pale: string; dot: string }> = {
  brand: { text: 'var(--tj-brand-deep)', pale: 'var(--tj-brand-pale)', dot: 'var(--tj-brand)' },
  ready: { text: 'var(--tj-ready-text)', pale: 'var(--tj-ready-pale)', dot: 'var(--tj-ready)' },
  cooking: { text: 'var(--tj-cooking-text)', pale: 'var(--tj-cooking-pale)', dot: 'var(--tj-cooking)' },
  pending: { text: 'var(--tj-pending-text)', pale: 'var(--tj-pending-pale)', dot: 'var(--tj-pending)' },
  danger: { text: 'var(--tj-danger-text)', pale: 'var(--tj-danger-pale)', dot: 'var(--tj-danger)' },
  info: { text: 'var(--tj-info-text)', pale: 'var(--tj-info-pale)', dot: 'var(--tj-info)' },
};
