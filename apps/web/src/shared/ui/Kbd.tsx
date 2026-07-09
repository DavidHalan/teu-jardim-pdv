import type { CSSProperties, ReactNode } from 'react';

/**
 * Tecla de atalho (DESIGN.md v2): mono, borda hairline-strong, superfície-2. Só desktop
 * (o teclado é interface no PC do caixa). Decorativa/hint — `aria-hidden`.
 */
export function Kbd({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <kbd aria-hidden="true" style={base}>
      {children}
    </kbd>
  );
}

const base: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '18px',
  padding: '1px 5px',
  fontFamily: 'var(--tj-font-mono)',
  fontSize: '10.5px',
  lineHeight: 1.4,
  color: 'var(--tj-muted)',
  background: 'var(--tj-surface-2)',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--tj-hairline-strong)',
  borderRadius: 'var(--tj-radius-xs)',
};
