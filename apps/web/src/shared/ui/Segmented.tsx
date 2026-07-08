import type { CSSProperties } from 'react';

/**
 * Seletor segmentado (single-select) do design system v2 — afordância única p/ escolher
 * 1 de N (tipo de conta, área do caixa, forma de pagamento). Trilho surface-1 + hairline;
 * segmento selecionado em accent-tint (texto accent-deep). Acessível: radiogroup.
 */
interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  columns?: number;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  columns,
}: SegmentedProps<T>): React.JSX.Element {
  const cols = columns ?? options.length;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ ...track, gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt.value)}
            className="tj-press"
            style={{ ...segment, ...(on ? segmentOn : null) }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const track: CSSProperties = {
  display: 'grid',
  gap: '4px',
  padding: '4px',
  background: 'var(--tj-surface-1)',
  border: '1px solid var(--tj-hairline)',
  borderRadius: 'var(--tj-radius-md)',
};

const segment: CSSProperties = {
  minHeight: '44px',
  padding: '0 var(--tj-space-2)',
  fontFamily: 'var(--tj-font-ui)',
  fontSize: '14px',
  fontWeight: 600,
  color: 'var(--tj-muted)',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 'var(--tj-radius-sm)',
  cursor: 'pointer',
};

const segmentOn: CSSProperties = {
  color: 'var(--tj-accent-deep)',
  background: 'var(--tj-accent-tint)',
};
