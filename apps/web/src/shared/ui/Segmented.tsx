import type { CSSProperties } from 'react';

/**
 * Seletor segmentado (single-select) do design system — afordância única p/ escolher
 * 1 de N (tipo de conta, tipo de desconto, forma de pagamento). Padrão "track": trilho
 * canvas-soft + segmento selecionado em surface com borda oliva. Acessível: radiogroup.
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
  gap: '6px',
  padding: '4px',
  background: 'var(--tj-canvas-soft)',
  borderRadius: 'var(--tj-radius-input)',
};

const segment: CSSProperties = {
  minHeight: '44px',
  padding: '0 var(--tj-space-2)',
  fontFamily: 'var(--tj-font-ui)',
  fontSize: '15px',
  fontWeight: 600,
  color: 'var(--tj-muted)',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 'var(--tj-radius-input)',
  cursor: 'pointer',
};

const segmentOn: CSSProperties = {
  color: 'var(--tj-brand-deep)',
  background: 'var(--tj-surface)',
  borderColor: 'var(--tj-brand)',
  boxShadow: 'var(--tj-shadow-card)',
};
