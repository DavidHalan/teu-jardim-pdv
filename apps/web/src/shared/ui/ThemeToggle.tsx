import { useState } from 'react';
import type { CSSProperties } from 'react';

/**
 * Tema claro/escuro (decisão do dono 2026-06-26). Claro = padrão; preferência persiste
 * em localStorage e é aplicada via [data-theme] no <html> (no-flash inline em index.html).
 * Só há 1 header por tela → 1 instância do hook por vez; o estado inicia do storage/DOM.
 */
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tj.theme';

export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage indisponível: aplica só na sessão */
  }
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle(): React.JSX.Element {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  function toggle(): void {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  const goingDark = theme === 'light';
  return (
    <button
      type="button"
      onClick={toggle}
      className="tj-press"
      style={styles.button}
      aria-label={goingDark ? 'Ativar tema escuro' : 'Ativar tema claro'}
      title={goingDark ? 'Tema escuro' : 'Tema claro'}
    >
      {goingDark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

const styles: Record<string, CSSProperties> = {
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    color: 'var(--tj-body)',
    background: 'transparent',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
  },
};
