import type { ButtonHTMLAttributes, CSSProperties } from 'react';

/**
 * Botão do design system (DESIGN.md v2): raio md, Inter 600, toque ≥44px, press scale(0.97)
 * via classe `.tj-press` (base.css). Primary = accent; secondary = canvas + borda. Variantes
 * cobrem o vocabulário das telas — não redefinir botão inline. `busy` = ação em curso; `disabled` = bloqueado.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  busy?: boolean;
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  busy = false,
  disabled = false,
  className,
  style,
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  const blocked = disabled || busy;
  return (
    <button
      type="button"
      disabled={blocked}
      className={['tj-press', className].filter(Boolean).join(' ')}
      style={{
        ...base,
        ...variants[variant],
        ...(fullWidth ? { width: '100%' } : null),
        ...(busy ? { opacity: 0.7, cursor: 'progress' } : null),
        ...(disabled && !busy ? { opacity: 0.5, cursor: 'not-allowed' } : null),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--tj-space-2)',
  minHeight: '44px',
  padding: '0 var(--tj-space-4)',
  fontFamily: 'var(--tj-font-ui)',
  fontSize: '15px',
  fontWeight: 600,
  lineHeight: 1.2,
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'transparent',
  borderRadius: 'var(--tj-radius-md)',
  cursor: 'pointer',
};

const variants: Record<Variant, CSSProperties> = {
  primary: {
    color: 'var(--tj-on-accent)',
    background: 'var(--tj-accent)',
  },
  secondary: {
    color: 'var(--tj-ink)',
    background: 'var(--tj-canvas)',
    borderColor: 'var(--tj-hairline-strong)',
  },
  ghost: {
    color: 'var(--tj-accent-deep)',
    background: 'transparent',
    borderColor: 'var(--tj-hairline-strong)',
  },
  danger: {
    color: 'var(--tj-on-accent)',
    background: 'var(--tj-danger)',
  },
  'danger-ghost': {
    color: 'var(--tj-danger)',
    background: 'transparent',
    borderColor: 'var(--tj-danger)',
  },
};
