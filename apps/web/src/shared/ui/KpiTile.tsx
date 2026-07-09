import type { CSSProperties } from 'react';

/**
 * Indicador do strip do quadro (DESIGN.md v2, padrão Sischef): valor grande (ink, tabular)
 * + rótulo eyebrow. `tone="warn"` tinge o valor (ex.: contas paradas). Sem gráfico, sem
 * gradiente — número grande é permitido, hero-metric-template não.
 */
interface KpiTileProps {
  label: string;
  value: string;
  tone?: 'default' | 'warn';
}

export function KpiTile({ label, value, tone = 'default' }: KpiTileProps): React.JSX.Element {
  return (
    <div style={base}>
      <span style={{ ...valueStyle, ...(tone === 'warn' ? warnValue : null) }} className="tj-tnum">
        {value}
      </span>
      <span style={labelStyle}>{label}</span>
    </div>
  );
}

const base: CSSProperties = {
  display: 'grid',
  gap: '2px',
  minWidth: '128px',
  padding: 'var(--tj-space-2) var(--tj-space-3)',
  background: 'var(--tj-surface-1)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--tj-hairline)',
  borderRadius: 'var(--tj-radius-md)',
};

const valueStyle: CSSProperties = {
  fontSize: '19px',
  fontWeight: 600,
  letterSpacing: '-0.3px',
  color: 'var(--tj-ink)',
};

const warnValue: CSSProperties = { color: 'var(--tj-warn)' };

const labelStyle: CSSProperties = {
  fontSize: 'var(--tj-fs-eyebrow)',
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--tj-muted)',
};
