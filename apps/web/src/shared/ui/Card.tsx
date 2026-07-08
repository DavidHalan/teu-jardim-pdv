import type { CSSProperties, HTMLAttributes } from 'react';

/**
 * Cartão do design system (DESIGN.md v2): canvas + hairline + raio md, SEM sombra
 * (elevação por hairline só). Sem card aninhado. Passa props de <section> (aria-labelledby
 * etc.). Use `padded={false}` quando o conteúdo controla o padding.
 */
interface CardProps extends HTMLAttributes<HTMLElement> {
  padded?: boolean;
}

export function Card({
  padded = true,
  className,
  style,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  return (
    <section
      className={className}
      style={{ ...base, ...(padded ? { padding: 'var(--tj-space-5)' } : null), ...style }}
      {...rest}
    >
      {children}
    </section>
  );
}

const base: CSSProperties = {
  boxSizing: 'border-box',
  background: 'var(--tj-canvas)',
  border: '1px solid var(--tj-hairline)',
  borderRadius: 'var(--tj-radius-md)',
};
