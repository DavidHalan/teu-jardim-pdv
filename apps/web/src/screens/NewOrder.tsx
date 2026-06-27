import { useEffect, useId, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabType } from '@teu-jardim/shared';
import type { AccountSummaryDto } from '@teu-jardim/shared';
import { accountsApi } from '../accounts/accounts-api';
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';
import { Alert, Button, ComandaTile, ScreenHeader, Segmented, TextField } from '../shared/ui';

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
      <ScreenHeader onBack={() => navigate('/')} backLabel="Início" eyebrow="Lançar pedido" />

      <main style={styles.main}>
        <h1 style={styles.title}>Informe a conta</h1>
        <p style={styles.help}>Escolha uma conta aberta ou abra uma nova para começar.</p>

        {loadingList ? (
          <section style={styles.section} aria-hidden="true">
            <h2 style={styles.sectionTitle}>Contas abertas</h2>
            <div style={styles.grid}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} style={styles.skelTile} />
              ))}
            </div>
          </section>
        ) : accounts.length > 0 ? (
          <section style={styles.section} aria-labelledby={`${id}-open`}>
            <h2 id={`${id}-open`} style={styles.sectionTitle}>
              Contas abertas
            </h2>
            <div style={styles.grid}>
              {accounts.map((acc) => (
                <ComandaTile
                  key={acc.id}
                  kind={TAB_LABEL[acc.tabType]}
                  number={acc.number}
                  total={formatBRL(acc.total)}
                  meta={itemCountLabel(acc.itemCount)}
                  inUse
                  onClick={() => navigate(`/conta/${acc.id}`)}
                />
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
              <Segmented
                ariaLabel="Tipo de conta"
                options={TAB_ORDER.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
                value={tabType}
                onChange={setTabType}
              />
            </div>

            <TextField
              label="Número"
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
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />

            {hasError ? <Alert id={`${id}-err`}>{error}</Alert> : null}

            <Button type="submit" busy={submitting} disabled={!canOpen && !submitting} fullWidth>
              {submitting ? 'Abrindo…' : 'Abrir e lançar'}
            </Button>
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

/* ── Estilos (layout) ──────────────────────────────────────────────────────── */

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--tj-canvas)',
    color: 'var(--tj-ink)',
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
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '30px',
    lineHeight: 1.1,
    letterSpacing: '-0.6px',
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
  skelTile: {
    minHeight: '108px',
    background: 'var(--tj-canvas-soft)',
    borderRadius: 'var(--tj-radius-md)',
  },
  form: { display: 'grid', gap: 'var(--tj-space-3)', maxWidth: '420px' },
  field: { display: 'grid', gap: 'var(--tj-space-2)' },
  label: { fontSize: 'var(--tj-fs-body-sm)', fontWeight: 500, color: 'var(--tj-body)' },
};
