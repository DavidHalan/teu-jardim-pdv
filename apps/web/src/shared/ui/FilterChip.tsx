import type { CSSProperties, ReactNode } from 'react';

/**
 * Chip de filtro (DESIGN.md v2): pill de seleção rápida. Inativo = borda hairline; ativo =
 * borda accent + texto accent-deep + fundo accent-tint. Toque ≥44px. `aria-pressed` reflete
 * o estado (toggle). Distinto do Segmented (single-select 1-de-N); chip é filtro pontual.
 */
interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  ariaLabel?: string;
}

export function FilterChip({ active, onClick, children, ariaLabel }: FilterChipProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className="tj-press"
      style={{ ...base, ...(active ? on : null) }}
    >
      {children}
    </button>
  );
}

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '44px',
  padding: '0 var(--tj-space-3)',
  fontFamily: 'var(--tj-font-ui)',
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--tj-body)',
  background: 'transparent',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--tj-hairline)',
  borderRadius: 'var(--tj-radius-pill)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const on: CSSProperties = {
  color: 'var(--tj-accent-deep)',
  background: 'var(--tj-accent-tint)',
  borderColor: 'var(--tj-accent)',
  fontWeight: 600,
};
