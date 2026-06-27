import type { CSSProperties, HTMLAttributes } from 'react';

/**
 * Cartão do design system: surface + hairline + raio md + sombra sussurrada (DESIGN.md
 * "elevação = hairline + sombra"). Sem card aninhado, sem drop pesado. Passa props de
 * <section> (aria-labelledby etc.). Use `padded={false}` quando o conteúdo controla o padding.
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
  background: 'var(--tj-surface)',
  border: '1px solid var(--tj-hairline)',
  borderRadius: 'var(--tj-radius-md)',
  boxShadow: 'var(--tj-shadow-card)',
};
