import { useEffect, useId, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabType } from '@teu-jardim/shared';
import type { AccountSummaryDto } from '@teu-jardim/shared';
import { accountsApi } from '../accounts/accounts-api';
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';

/**
 * Passo 1 do lançamento (PRD §12, RB-018): "informar conta". O garçom escolhe uma
 * conta aberta existente (grid glanceável) ou abre uma nova por (tipo, número) e
 * segue para a tela de pedido. Primeira tela no celular, em pé, uma mão: alvos
 * generosos, fluxo linear, calma sob pressão. Reusa o sistema visual do turno.
 */
export function NewOrder(): React.JSX.Element {
  const navigate = useNavigate();
  const id = useId();

  const [accounts, setAccounts] = useState<AccountSummaryDto[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [tabType, setTabType] = useState<TabType>(TabType.COMANDA);
  const [number, setNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    accountsApi
      .list()
      .then((res) => alive && setAccounts(res.accounts))
      .catch(() => undefined)
      .finally(() => alive && setLoadingList(false));
    return () => {
      alive = false;
    };
  }, []);

  const parsed = Number(number);
  const canOpen = Number.isInteger(parsed) && parsed >= 1 && !submitting;

  function openAccount(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!canOpen) return;
    setError(null);
    setSubmitting(true);
    accountsApi
      .open({ tabType, number: parsed })
      .then((acc) => navigate(`/conta/${acc.id}`))
      .catch((err) => {
        setError(err instanceof ApiError ? messageFor(err) : OFFLINE);
        setSubmitting(false);
      });
  }

  const hasError = error !== null;

  return (
    <div style={styles.page}>
      <style>{scopedCss}</style>

      <header style={styles.topbar}>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={styles.backButton}
          className="tj-press"
          aria-label="Voltar ao início"
        >
          <span aria-hidden="true" style={styles.backArrow}>
            ←
          </span>
          Início
        </button>
        <span style={styles.eyebrow}>Lançar pedido</span>
      </header>

      <main style={styles.main}>
        <h1 style={styles.title}>Informe a conta</h1>
        <p style={styles.help}>Escolha uma conta aberta ou abra uma nova para começar.</p>

        {!loadingList && accounts.length > 0 ? (
          <section style={styles.section} aria-labelledby={`${id}-open`}>
            <h2 id={`${id}-open`} style={styles.sectionTitle}>
              Contas abertas
            </h2>
            <div style={styles.grid}>
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => navigate(`/conta/${acc.id}`)}
                  style={styles.accountCard}
                  className="tj-press tj-card"
                >
                  <span style={styles.accountKind}>{TAB_LABEL[acc.tabType]}</span>
                  <span style={styles.accountNumber}>{acc.number}</span>
                  <span style={styles.accountMeta}>
                    <span style={styles.accountTotal}>{formatBRL(acc.total)}</span>
                    <span style={styles.accountCount}>{itemCountLabel(acc.itemCount)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section style={styles.section} aria-labelledby={`${id}-new`}>
          <h2 id={`${id}-new`} style={styles.sectionTitle}>
            Abrir nova conta
          </h2>
          <form style={styles.form} onSubmit={openAccount} noValidate>
            <div style={styles.field}>
              <span style={styles.label} id={`${id}-tab`}>
                Tipo
              </span>
              <div style={styles.segmented} role="radiogroup" aria-labelledby={`${id}-tab`}>
                {TAB_ORDER.map((t) => {
                  const selected = t === tabType;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setTabType(t)}
                      style={{ ...styles.segment, ...(selected ? styles.segmentOn : null) }}
                      className="tj-press"
                    >
                      {TAB_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={styles.field}>
              <label htmlFor={`${id}-num`} style={styles.label}>
                Número
              </label>
              <input
                id={`${id}-num`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
                autoFocus
                placeholder="Ex.: 25"
                maxLength={6}
                disabled={submitting}
                aria-invalid={hasError}
                aria-describedby={hasError ? `${id}-err` : undefined}
                style={styles.input}
                className="tj-input"
              />
            </div>

            {hasError ? (
              <p id={`${id}-err`} role="alert" style={styles.error}>
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!canOpen}
              style={{ ...styles.cta, ...(canOpen ? null : styles.ctaDisabled) }}
              className="tj-press"
            >
              {submitting ? 'Abrindo…' : 'Abrir e lançar'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const TAB_ORDER: TabType[] = [TabType.COMANDA, TabType.WRISTBAND, TabType.TABLE];

const TAB_LABEL: Record<TabType, string> = {
  [TabType.WRISTBAND]: 'Pulseira',
  [TabType.COMANDA]: 'Comanda',
  [TabType.TABLE]: 'Mesa',
};

const OFFLINE = 'Sem conexão com o servidor. Verifique a rede e tente de novo.';

function messageFor(err: ApiError): string {
  // 409 (RB-003): já existe conta aberta para esse número — a API devolve PT.
  if (err.status === 409) return `${err.message} Toque na conta acima para continuar nela.`;
  return 'Não foi possível abrir a conta. Tente novamente.';
}

function itemCountLabel(n: number): string {
  if (n === 0) return 'sem itens';
  return n === 1 ? '1 item' : `${n} itens`;
}

/* ── Estilos ─────────────────────────────────────────────────────────────── */

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--tj-cream)',
    fontFamily: 'var(--tj-font-ui)',
    color: 'var(--tj-ink)',
  },
  topbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-3)',
    padding: 'var(--tj-space-2) var(--tj-space-4)',
    background: 'var(--tj-surface)',
    borderBottom: '1px solid var(--tj-hairline)',
  },
  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--tj-space-2)',
    minHeight: '44px',
    padding: '0 var(--tj-space-3) 0 var(--tj-space-2)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--tj-body)',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
    transition: 'transform 80ms ease, background 120ms ease',
  },
  backArrow: { fontSize: '18px', lineHeight: 1 },
  eyebrow: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  main: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '720px',
    margin: '0 auto',
    padding: 'var(--tj-space-5) var(--tj-space-4)',
    display: 'grid',
    gap: 'var(--tj-space-2)',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '30px',
    lineHeight: 1.1,
    letterSpacing: '-0.4px',
    color: 'var(--tj-ink)',
  },
  help: {
    margin: '0 0 var(--tj-space-4)',
    fontSize: '15px',
    lineHeight: 1.5,
    color: 'var(--tj-muted)',
    maxWidth: '52ch',
  },
  section: { display: 'grid', gap: 'var(--tj-space-3)', marginBottom: 'var(--tj-space-5)' },
  sectionTitle: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  grid: {
    display: 'grid',
    gap: 'var(--tj-space-3)',
    gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
  },
  accountCard: {
    display: 'grid',
    gap: '2px',
    justifyItems: 'start',
    textAlign: 'left',
    minHeight: '108px',
    padding: 'var(--tj-space-3)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius)',
    cursor: 'pointer',
    transition: 'transform 80ms ease, border-color 120ms ease, box-shadow 120ms ease',
  },
  accountKind: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  accountNumber: {
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '34px',
    lineHeight: 1.05,
    color: 'var(--tj-ink)',
    fontVariantNumeric: 'tabular-nums',
  },
  accountMeta: { display: 'grid', gap: '1px', marginTop: 'var(--tj-space-1)' },
  accountTotal: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--tj-body)',
    fontVariantNumeric: 'tabular-nums',
  },
  accountCount: { fontSize: '12px', color: 'var(--tj-faint)' },

  form: { display: 'grid', gap: 'var(--tj-space-3)', maxWidth: '420px' },
  field: { display: 'grid', gap: 'var(--tj-space-2)' },
  label: { fontSize: '14px', fontWeight: 500, color: 'var(--tj-body)' },
  segmented: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '6px',
    padding: '4px',
    background: 'var(--tj-canvas-soft)',
    borderRadius: 'var(--tj-radius-input)',
  },
  segment: {
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
    transition: 'transform 80ms ease, background 120ms ease, color 120ms ease',
  },
  segmentOn: {
    color: 'var(--tj-cta)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-olive)',
    boxShadow: '0 1px 2px rgba(26, 27, 18, 0.06)',
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
    fontVariantNumeric: 'tabular-nums',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
  },
  error: {
    margin: 0,
    padding: 'var(--tj-space-2) var(--tj-space-3)',
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: 1.45,
    color: 'var(--tj-danger-text)',
    background: 'var(--tj-danger-pale)',
    borderRadius: 'var(--tj-radius-input)',
  },
  cta: {
    marginTop: 'var(--tj-space-1)',
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
  ctaDisabled: { opacity: 0.5, cursor: 'not-allowed' },
};

// Pseudo-estados que estilo inline não cobre (mesma base do Login/Home).
const scopedCss = `
.tj-input:focus-visible {
  border-color: var(--tj-olive);
  box-shadow: 0 0 0 3px var(--tj-pale);
}
.tj-input::placeholder { color: var(--tj-faint); }
.tj-press:focus-visible {
  outline: 3px solid var(--tj-pale);
  outline-offset: 2px;
}
.tj-press:not(:disabled):active { transform: scale(0.97); }
.tj-card:not(:disabled):hover {
  border-color: var(--tj-hairline-strong);
  box-shadow: 0 2px 8px rgba(26, 27, 18, 0.08);
}
@media (prefers-reduced-motion: reduce) {
  .tj-input, .tj-press, .tj-card { transition: none; }
  .tj-press:not(:disabled):active { transform: none; }
}
`;
