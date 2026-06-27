import type { CSSProperties } from 'react';

/**
 * Comanda-tile (assinatura DESIGN.md, herdada do Sischef e reskinada): tile de número
 * grande, estado por vislumbre. `inUse` = borda oliva 1.5px + número ink (conta aberta,
 * RB-005 disponibilidade derivada); livre = hairline + número faint. Clicável → onClick.
 */
interface ComandaTileProps {
  kind: string;
  number: number | string;
  total?: string;
  meta?: string;
  inUse?: boolean;
  onClick?: () => void;
}

export function ComandaTile({
  kind,
  number,
  total,
  meta,
  inUse = false,
  onClick,
}: ComandaTileProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tj-press tj-card"
      style={{ ...tile, ...(inUse ? tileInUse : null) }}
    >
      <span style={kindStyle}>{kind}</span>
      <span style={{ ...numberStyle, color: inUse ? 'var(--tj-ink)' : 'var(--tj-faint)' }} className="tj-tnum">
        {number}
      </span>
      {total !== undefined || meta !== undefined ? (
        <span style={metaWrap}>
          {total !== undefined ? (
            <span style={totalStyle} className="tj-tnum">
              {total}
            </span>
          ) : null}
          {meta !== undefined ? <span style={metaStyle}>{meta}</span> : null}
        </span>
      ) : null}
    </button>
  );
}

const tile: CSSProperties = {
  display: 'grid',
  gap: '2px',
  justifyItems: 'start',
  textAlign: 'left',
  minHeight: '108px',
  padding: 'var(--tj-space-3)',
  background: 'var(--tj-surface)',
  border: '1px solid var(--tj-hairline)',
  borderRadius: 'var(--tj-radius-md)',
  cursor: 'pointer',
};

const tileInUse: CSSProperties = { border: '1.5px solid var(--tj-brand)' };

const kindStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--tj-muted)',
};

const numberStyle: CSSProperties = {
  fontFamily: 'var(--tj-font-ui)',
  fontWeight: 700,
  fontSize: '34px',
  lineHeight: 1.05,
  letterSpacing: '-0.5px',
};

const metaWrap: CSSProperties = { display: 'grid', gap: '1px', marginTop: 'var(--tj-space-1)' };

const totalStyle: CSSProperties = { fontSize: '15px', fontWeight: 700, color: 'var(--tj-body)' };

const metaStyle: CSSProperties = { fontSize: '12px', color: 'var(--tj-faint)' };
