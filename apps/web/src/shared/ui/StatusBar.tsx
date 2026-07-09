import type { CSSProperties } from 'react';

/**
 * Barra de status do quadro (DESIGN.md v2): rodapé mono com contagem viva. Cada item =
 * valor (ink, ou warn) + rótulo (body); `right` empurra um metadado ao fim (ex.: "há 5 s").
 * Hairline no topo, sem fundo — leitura de terminal, não card.
 */
interface StatusBarItem {
  value: string;
  label: string;
  tone?: 'default' | 'warn';
}

export function StatusBar({ items, right }: { items: StatusBarItem[]; right?: string }): React.JSX.Element {
  return (
    <div style={bar} role="status" aria-live="off">
      {items.map((it, i) => (
        <span key={i} style={item}>
          <b style={{ ...value, ...(it.tone === 'warn' ? warn : null) }} className="tj-tnum">
            {it.value}
          </b>{' '}
          {it.label}
        </span>
      ))}
      {right ? <span style={rightStyle}>{right}</span> : null}
    </div>
  );
}

const bar: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--tj-space-lg)',
  padding: 'var(--tj-space-2) 0',
  borderTop: '1px solid var(--tj-hairline)',
  fontFamily: 'var(--tj-font-mono)',
  fontSize: '12px',
  color: 'var(--tj-body)',
};

const item: CSSProperties = { whiteSpace: 'nowrap' };
const value: CSSProperties = { color: 'var(--tj-ink)', fontWeight: 400 };
const warn: CSSProperties = { color: 'var(--tj-warn)' };
const rightStyle: CSSProperties = { marginLeft: 'auto', color: 'var(--tj-muted)' };
