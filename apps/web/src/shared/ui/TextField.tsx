import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react';

/**
 * Campo de formulário do design system: rótulo + input (classe `.tj-input` p/ foco/
 * placeholder em base.css). `leading` desenha um adorno fixo (ex.: "R$") com o input
 * recuado e `tabular-nums`. Erro fica fora (componente Alert), no nível do form.
 */
interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  leading?: ReactNode;
}

export function TextField({
  label,
  id,
  leading,
  className,
  style,
  ...rest
}: TextFieldProps): React.JSX.Element {
  return (
    <div style={fieldWrap}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {leading !== undefined ? (
        <div style={prefixWrap}>
          <span aria-hidden="true" style={prefixStyle}>
            {leading}
          </span>
          <input
            id={id}
            className={['tj-input', className].filter(Boolean).join(' ')}
            style={{ ...inputStyle, ...withPrefix, ...style }}
            {...rest}
          />
        </div>
      ) : (
        <input
          id={id}
          className={['tj-input', className].filter(Boolean).join(' ')}
          style={{ ...inputStyle, ...style }}
          {...rest}
        />
      )}
    </div>
  );
}

const fieldWrap: CSSProperties = { display: 'grid', gap: 'var(--tj-space-1)' };

const labelStyle: CSSProperties = {
  fontSize: 'var(--tj-fs-body-sm)',
  fontWeight: 500,
  color: 'var(--tj-body)',
};

const inputStyle: CSSProperties = {
  boxSizing: 'border-box',
  width: '100%',
  minHeight: '46px',
  padding: '0 var(--tj-space-3)',
  fontFamily: 'var(--tj-font-ui)',
  fontSize: 'var(--tj-fs-body)',
  color: 'var(--tj-ink)',
  background: 'var(--tj-surface)',
  border: '1px solid var(--tj-hairline)',
  borderRadius: 'var(--tj-radius-input)',
  outline: 'none',
};

const prefixWrap: CSSProperties = { position: 'relative', display: 'flex', alignItems: 'center' };

const prefixStyle: CSSProperties = {
  position: 'absolute',
  left: 'var(--tj-space-3)',
  fontSize: 'var(--tj-fs-body)',
  fontWeight: 600,
  color: 'var(--tj-muted)',
  pointerEvents: 'none',
};

const withPrefix: CSSProperties = { paddingLeft: '44px', fontVariantNumeric: 'tabular-nums' };
