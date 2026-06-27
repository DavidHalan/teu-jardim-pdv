import type { CSSProperties, ReactNode } from 'react';

/**
 * Mensagem de estado do design system: erro / aviso / info. Par cor + texto (DESIGN.md:
 * nunca matiz só). `role="alert"` por padrão (erro/aviso anunciam); info usa `status`.
 */
type Tone = 'error' | 'warn' | 'info';

interface AlertProps {
  children: ReactNode;
  tone?: Tone;
  id?: string;
}

export function Alert({ children, tone = 'error', id }: AlertProps): React.JSX.Element {
  return (
    <p id={id} role={tone === 'info' ? 'status' : 'alert'} style={{ ...base, ...tones[tone] }}>
      {children}
    </p>
  );
}

const base: CSSProperties = {
  margin: 0,
  padding: 'var(--tj-space-2) var(--tj-space-3)',
  fontSize: 'var(--tj-fs-body-sm)',
  fontWeight: 500,
  lineHeight: 1.45,
  borderRadius: 'var(--tj-radius-input)',
};

const tones: Record<Tone, CSSProperties> = {
  error: { color: 'var(--tj-danger-text)', background: 'var(--tj-danger-pale)' },
  warn: { color: 'var(--tj-cooking-text)', background: 'var(--tj-cooking-pale)' },
  info: { color: 'var(--tj-info-text)', background: 'var(--tj-info-pale)' },
};
