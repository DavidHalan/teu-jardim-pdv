import { useId, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';
import { Alert, Button, Card, TextField, ThemeToggle } from '../shared/ui';

/**
 * Tela de login do PDV (garçom no celular / caixa no PC, na LAN). Primeira
 * impressão do produto: clima garden-to-table do Teu Jardim, não formulário
 * genérico. Tema claro (canvas creme), cartão único centrado, tipografia Inter
 * (peso/tamanho para hierarquia). Não navega — o router redireciona no sucesso (Task 14).
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
  const describedBy = hasError ? errorId : undefined;

  return (
    <main style={styles.canvas}>
      <div style={styles.themeCorner}>
        <ThemeToggle />
      </div>
      <Card style={styles.card} aria-labelledby="tj-login-title">
        <header style={styles.brand}>
          <h1 id="tj-login-title" style={styles.wordmark}>
            Teu Jardim
          </h1>
          <p style={styles.subtitle}>Ponto de venda</p>
        </header>

        <form style={styles.form} onSubmit={handleSubmit} noValidate>
          <TextField
            label="Usuário"
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
            aria-describedby={describedBy}
          />

          <TextField
            label="Senha"
            id="tj-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={submitting}
            aria-invalid={hasError}
            aria-describedby={describedBy}
          />

          {hasError ? <Alert id={errorId}>{error}</Alert> : null}

          <Button type="submit" busy={submitting} fullWidth style={styles.submit}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Card>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  canvas: {
    position: 'relative',
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: 'var(--tj-space-4)',
    background: 'var(--tj-canvas)',
  },
  themeCorner: {
    position: 'absolute',
    top: 'var(--tj-space-4)',
    right: 'var(--tj-space-4)',
  },
  card: {
    width: '100%',
    maxWidth: '380px',
  },
  brand: {
    textAlign: 'center',
    marginBottom: 'var(--tj-space-5)',
  },
  wordmark: {
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '34px',
    lineHeight: 1.1,
    letterSpacing: '-0.8px',
    color: 'var(--tj-ink)',
  },
  subtitle: {
    margin: 'var(--tj-space-2) 0 0',
    fontSize: 'var(--tj-fs-body-sm)',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  form: {
    display: 'grid',
    gap: 'var(--tj-space-3)',
  },
  submit: {
    marginTop: 'var(--tj-space-2)',
  },
};
