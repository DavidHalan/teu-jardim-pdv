import type { CSSProperties, ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';

/**
 * Cabeçalho de tela com voltar + título + alternador de tema. Barra surface + hairline
 * (mesma do topbar do Home). `sticky` gruda no topo (telas longas: pedido, pagamento).
 * Botão voltar ≥44px.
 */
interface ScreenHeaderProps {
  onBack: () => void;
  backLabel: string;
  title?: ReactNode;
  eyebrow?: string;
  sticky?: boolean;
}

export function ScreenHeader({
  onBack,
  backLabel,
  title,
  eyebrow,
  sticky = false,
}: ScreenHeaderProps): React.JSX.Element {
  return (
    <header style={{ ...bar, ...(sticky ? stickyStyle : null) }}>
      <button
        type="button"
        onClick={onBack}
        className="tj-press"
        style={backBtn}
        aria-label={backLabel}
      >
        <span aria-hidden="true" style={arrow}>
          ←
        </span>
        {backLabel}
      </button>
      <div style={rightGroup}>
        {title ? <span style={titleStyle}>{title}</span> : null}
        {eyebrow ? <span style={eyebrowStyle}>{eyebrow}</span> : null}
        <ThemeToggle />
      </div>
    </header>
  );
}

const bar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tj-space-3)',
  padding: 'var(--tj-space-2) var(--tj-space-4)',
  background: 'var(--tj-surface)',
  borderBottom: '1px solid var(--tj-hairline)',
};

const stickyStyle: CSSProperties = { position: 'sticky', top: 0, zIndex: 5 };

const rightGroup: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tj-space-3)',
};

const backBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tj-space-2)',
  minHeight: '44px',
  padding: '0 var(--tj-space-3) 0 var(--tj-space-2)',
  fontFamily: 'var(--tj-font-ui)',
  fontSize: '15px',
  fontWeight: 600,
  color: 'var(--tj-body)',
  background: 'transparent',
  border: 'none',
  borderRadius: 'var(--tj-radius-pill)',
  cursor: 'pointer',
};

const arrow: CSSProperties = { fontSize: '18px', lineHeight: 1 };

const titleStyle: CSSProperties = {
  fontFamily: 'var(--tj-font-ui)',
  fontWeight: 700,
  fontSize: '18px',
  letterSpacing: '-0.3px',
  color: 'var(--tj-ink)',
};

const eyebrowStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--tj-muted)',
};
