import { useId, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';

/**
 * Tela de login do PDV (garçom no celular / caixa no PC, na LAN). Primeira
 * impressão do produto: clima garden-to-table do Teu Jardim, não formulário
 * genérico. Tema claro (canvas creme), cartão único centrado, marca em Fraunces,
 * campos em Inter. Não navega — o router redireciona no sucesso (Task 14).
 */
export function Login(): React.JSX.Element {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      // sucesso: o router troca de rota; mantém o botão desabilitado durante a troca.
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.status === 401
            ? 'Usuário ou senha inválidos.'
            : 'Não foi possível entrar. Tente novamente.',
        );
      } else {
        setError('Sem conexão com o servidor. Verifique a rede e tente de novo.');
      }
      setSubmitting(false);
    }
  }

  const hasError = error !== null;

  return (
    <main style={styles.canvas}>
      <style>{focusCss}</style>
      <section style={styles.card} aria-labelledby="tj-login-title">
        <header style={styles.brand}>
          <h1 id="tj-login-title" style={styles.wordmark}>
            Teu Jardim
          </h1>
          <p style={styles.subtitle}>Ponto de venda</p>
        </header>

        <form style={styles.form} onSubmit={handleSubmit} noValidate>
          <div style={styles.field}>
            <label htmlFor="tj-username" style={styles.label}>
              Usuário
            </label>
            <input
              id="tj-username"
              name="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={submitting}
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
              style={styles.input}
              className="tj-input"
            />
          </div>

          <div style={styles.field}>
            <label htmlFor="tj-password" style={styles.label}>
              Senha
            </label>
            <input
              id="tj-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={submitting}
              aria-invalid={hasError}
              aria-describedby={hasError ? errorId : undefined}
              style={styles.input}
              className="tj-input"
            />
          </div>

          {hasError ? (
            <p id={errorId} role="alert" style={styles.error}>
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            style={{ ...styles.button, ...(submitting ? styles.buttonDisabled : null) }}
            className="tj-submit"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </section>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  canvas: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: 'var(--tj-space-4)',
    background: 'var(--tj-cream)',
    fontFamily: 'var(--tj-font-ui)',
    color: 'var(--tj-ink)',
  },
  card: {
    width: '100%',
    maxWidth: '380px',
    boxSizing: 'border-box',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius)',
    boxShadow: '0 1px 2px rgba(26, 27, 18, 0.06)',
    padding: 'var(--tj-space-5)',
  },
  brand: {
    textAlign: 'center',
    marginBottom: 'var(--tj-space-5)',
  },
  wordmark: {
    margin: 0,
    fontFamily: 'var(--tj-font-display)',
    fontOpticalSizing: 'auto',
    fontWeight: 600,
    fontSize: '34px',
    lineHeight: 1.1,
    letterSpacing: '-0.4px',
    color: 'var(--tj-ink)',
  },
  subtitle: {
    margin: 'var(--tj-space-2) 0 0',
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  form: {
    display: 'grid',
    gap: 'var(--tj-space-3)',
  },
  field: {
    display: 'grid',
    gap: 'var(--tj-space-1)',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--tj-body)',
  },
  input: {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: '46px',
    padding: '0 var(--tj-space-3)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '16px',
    color: 'var(--tj-ink)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-input)',
    outline: 'none',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
  },
  error: {
    margin: 0,
    padding: 'var(--tj-space-2) var(--tj-space-3)',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--tj-danger-text)',
    background: 'var(--tj-danger-pale)',
    borderRadius: 'var(--tj-radius-input)',
  },
  button: {
    marginTop: 'var(--tj-space-2)',
    minHeight: '48px',
    padding: '0 var(--tj-space-4)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--tj-cta-contrast)',
    background: 'var(--tj-cta)',
    border: 'none',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
    transition: 'transform 80ms ease, opacity 120ms ease',
  },
  buttonDisabled: {
    opacity: 0.7,
    cursor: 'progress',
  },
};

// Pseudo-estados que style inline não cobre: foco visível (ring oliva), placeholder,
// press do botão e prefers-reduced-motion. Escopo via classes tj-*.
const focusCss = `
.tj-input:focus-visible {
  border-color: var(--tj-olive);
  box-shadow: 0 0 0 3px var(--tj-pale);
}
.tj-input::placeholder { color: var(--tj-faint); }
.tj-submit:focus-visible {
  outline: 3px solid var(--tj-pale);
  outline-offset: 2px;
}
.tj-submit:not(:disabled):active { transform: scale(0.97); }
@media (prefers-reduced-motion: reduce) {
  .tj-input, .tj-submit { transition: none; }
  .tj-submit:not(:disabled):active { transform: none; }
}
`;
