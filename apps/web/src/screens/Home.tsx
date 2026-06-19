import { useEffect, useId, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Role } from '@teu-jardim/shared';
import type { RegisterCloseSummary, RegisterClosedDto } from '@teu-jardim/shared';
import { useAuth } from '../auth/AuthContext';
import { useShift } from '../shift/useShift';
import { shiftApi } from '../shift/shift-api';
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';

/**
 * Tela operacional pós-login do PDV. Máquina de estado do turno: sem operação →
 * abrir operação; com operação sem caixa → abrir caixa; com ambos → dashboard.
 * Estado por vislumbre (cor + forma + texto), calma sob pressão, primeiro dia sem
 * treino. Reusa o sistema visual do Login (creme/oliva/Fraunces). Caixa/Admin abrem;
 * garçom aguarda. Lançar pedido entra na S3.
 */
export function Home(): React.JSX.Element {
  const { user, logout } = useAuth();
  const { loading, session, register, refresh } = useShift();

  const today = useMemo(() => new Date().toLocaleDateString('pt-BR'), []);
  const [name, setName] = useState(today);
  const [openingAmount, setOpeningAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canOperate = user?.role === Role.CASHIER || user?.role === Role.ADMIN;

  async function run(action: () => Promise<void>, fallback: string): Promise<void> {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? messageFor(err, fallback) : OFFLINE);
    } finally {
      setSubmitting(false);
    }
  }

  function openSession(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(
      () => shiftApi.openSession({ name: name.trim() }).then(() => undefined),
      'Não foi possível abrir a operação. Tente novamente.',
    );
  }

  function openRegister(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(
      () => shiftApi.openRegister({ openingAmount: normalizeAmount(openingAmount) }).then(() => undefined),
      'Não foi possível abrir o caixa. Tente novamente.',
    );
  }

  return (
    <div style={styles.page}>
      <style>{scopedCss}</style>
      <Topbar userName={user?.name ?? ''} role={user?.role} onLogout={logout} />

      <main style={styles.main}>
        {loading ? (
          <Centered>
            <p style={styles.loading} aria-live="polite">
              Carregando turno…
            </p>
          </Centered>
        ) : !session ? (
          canOperate ? (
            <OpenSessionForm
              name={name}
              onName={setName}
              submitting={submitting}
              error={error}
              onSubmit={openSession}
            />
          ) : (
            <WaitingCard
              title="Aguardando o turno"
              message="O caixa ainda não abriu a operação. Assim que abrir, você poderá lançar pedidos."
              onRefresh={() => void refresh()}
              disabled={submitting}
            />
          )
        ) : !register ? (
          canOperate ? (
            <OpenRegisterForm
              sessionName={session.name}
              openingAmount={openingAmount}
              onAmount={setOpeningAmount}
              submitting={submitting}
              error={error}
              onSubmit={openRegister}
            />
          ) : (
            <EmployeeLaunch sessionName={session.name} />
          )
        ) : (
          <Dashboard session={session} register={register} refresh={refresh} />
        )}
      </main>
    </div>
  );
}

/* ── Subcomponentes ──────────────────────────────────────────────────────── */

function Topbar({
  userName,
  role,
  onLogout,
}: {
  userName: string;
  role?: Role;
  onLogout: () => void;
}): React.JSX.Element {
  return (
    <header style={styles.topbar}>
      <div style={styles.brand}>
        <span style={styles.wordmark}>Teu Jardim</span>
        <span style={styles.eyebrow}>Ponto de venda</span>
      </div>
      <div style={styles.identity}>
        <span style={styles.userBlock}>
          <span style={styles.userName}>{userName}</span>
          {role ? <span style={styles.roleChip}>{ROLE_LABEL[role]}</span> : null}
        </span>
        <button type="button" onClick={onLogout} style={styles.ghostButton} className="tj-press">
          Sair
        </button>
      </div>
    </header>
  );
}

function OpenSessionForm({
  name,
  onName,
  submitting,
  error,
  onSubmit,
}: {
  name: string;
  onName: (v: string) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}): React.JSX.Element {
  const id = useId();
  const hasError = error !== null;
  return (
    <Centered>
      <section style={styles.card} aria-labelledby={`${id}-t`}>
        <p style={styles.cardEyebrow}>Turno</p>
        <h1 id={`${id}-t`} style={styles.cardTitle}>
          Abrir operação
        </h1>
        <p style={styles.cardHelp}>
          Nenhuma operação aberta. Abra para começar o atendimento do dia.
        </p>
        <form style={styles.form} onSubmit={onSubmit} noValidate>
          <div style={styles.field}>
            <label htmlFor={`${id}-name`} style={styles.label}>
              Nome da operação
            </label>
            <input
              id={`${id}-name`}
              type="text"
              value={name}
              onChange={(e) => onName(e.target.value)}
              autoFocus
              maxLength={80}
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
            disabled={submitting}
            style={{ ...styles.cta, ...(submitting ? styles.ctaBusy : null) }}
            className="tj-press"
          >
            {submitting ? 'Abrindo…' : 'Abrir operação'}
          </button>
        </form>
      </section>
    </Centered>
  );
}

function OpenRegisterForm({
  sessionName,
  openingAmount,
  onAmount,
  submitting,
  error,
  onSubmit,
}: {
  sessionName: string;
  openingAmount: string;
  onAmount: (v: string) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}): React.JSX.Element {
  const id = useId();
  const hasError = error !== null;
  return (
    <Centered>
      <section style={styles.card} aria-labelledby={`${id}-t`}>
        <div style={styles.cardStatus}>
          <StatusPill label="Operação aberta" />
          <span style={styles.cardStatusName}>{sessionName}</span>
        </div>
        <h1 id={`${id}-t`} style={styles.cardTitle}>
          Abrir caixa
        </h1>
        <p style={styles.cardHelp}>Informe o valor inicial em dinheiro na gaveta.</p>
        <form style={styles.form} onSubmit={onSubmit} noValidate>
          <div style={styles.field}>
            <label htmlFor={`${id}-amount`} style={styles.label}>
              Valor inicial
            </label>
            <div style={styles.amountWrap}>
              <span aria-hidden="true" style={styles.amountPrefix}>
                R$
              </span>
              <input
                id={`${id}-amount`}
                type="text"
                inputMode="decimal"
                value={openingAmount}
                onChange={(e) => onAmount(e.target.value)}
                autoFocus
                placeholder="0,00"
                disabled={submitting}
                aria-invalid={hasError}
                aria-describedby={hasError ? `${id}-err` : undefined}
                style={{ ...styles.input, ...styles.amountInput }}
                className="tj-input"
              />
            </div>
          </div>
          {hasError ? (
            <p id={`${id}-err`} role="alert" style={styles.error}>
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            style={{ ...styles.cta, ...(submitting ? styles.ctaBusy : null) }}
            className="tj-press"
          >
            {submitting ? 'Abrindo…' : 'Abrir caixa'}
          </button>
        </form>
      </section>
    </Centered>
  );
}

function WaitingCard({
  title,
  message,
  onRefresh,
  disabled,
}: {
  title: string;
  message: string;
  onRefresh: () => void;
  disabled: boolean;
}): React.JSX.Element {
  return (
    <Centered>
      <section style={styles.card}>
        <StatusPill label="Aguardando" tone="neutral" />
        <h1 style={{ ...styles.cardTitle, marginTop: 'var(--tj-space-3)' }}>{title}</h1>
        <p style={styles.cardHelp}>{message}</p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={disabled}
          style={styles.ghostButtonWide}
          className="tj-press"
        >
          Atualizar
        </button>
      </section>
    </Centered>
  );
}

function Dashboard({
  session,
  register,
  refresh,
}: {
  session: { name: string; openedAt: string };
  register: { openingAmount: string; openedAt: string };
  refresh: () => Promise<void>;
}): React.JSX.Element {
  const navigate = useNavigate();
  // Só um painel de fechamento aberto por vez. Caixa e operação fecham daqui (RB-011/007).
  const [panel, setPanel] = useState<'none' | 'register' | 'operation'>('none');

  return (
    <section style={styles.dashboard} aria-label="Turno em andamento">
      <div style={styles.dashHead}>
        <StatusPill label="Turno aberto" />
        <h1 style={styles.dashTitle}>Atendimento em andamento</h1>
      </div>

      <div style={styles.panel}>
        <div style={styles.infoBlock}>
          <p style={styles.infoLabel}>Operação</p>
          <p style={styles.infoValue}>{session.name}</p>
          <p style={styles.infoMeta}>Aberta às {formatTime(session.openedAt)}</p>
        </div>
        <div style={styles.panelDivider} aria-hidden="true" />
        <div style={styles.infoBlock}>
          <p style={styles.infoLabel}>Caixa</p>
          <p style={styles.infoValueNum}>{formatBRL(register.openingAmount)}</p>
          <p style={styles.infoMeta}>Valor inicial · aberto às {formatTime(register.openedAt)}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/lancar')}
        style={styles.cta}
        className="tj-press"
      >
        Lançar pedido
      </button>

      <div style={styles.closeActions}>
        <button
          type="button"
          onClick={() => setPanel((p) => (p === 'register' ? 'none' : 'register'))}
          style={styles.ghostButtonWide}
          className="tj-press"
          aria-expanded={panel === 'register'}
        >
          Fechar caixa
        </button>
        <button
          type="button"
          onClick={() => setPanel((p) => (p === 'operation' ? 'none' : 'operation'))}
          style={styles.ghostButtonWide}
          className="tj-press"
          aria-expanded={panel === 'operation'}
        >
          Encerrar operação
        </button>
      </div>

      {panel === 'register' ? (
        <CloseRegisterPanel refresh={refresh} onDone={() => setPanel('none')} />
      ) : null}
      {panel === 'operation' ? (
        <EndOperationPanel refresh={refresh} onCancel={() => setPanel('none')} />
      ) : null}
    </section>
  );
}

/** Fecha o caixa (RB-011/012/012a): prévia → contagem → diferença. */
function CloseRegisterPanel({
  refresh,
  onDone,
}: {
  refresh: () => Promise<void>;
  onDone: () => void;
}): React.JSX.Element {
  const id = useId();
  const [summary, setSummary] = useState<RegisterCloseSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counted, setCounted] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<RegisterClosedDto | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    let alive = true;
    shiftApi
      .closingSummary()
      .then((s) => {
        if (alive) setSummary(s);
      })
      .catch((err) => {
        if (alive) setLoadError(err instanceof ApiError ? err.message : OFFLINE);
      });
    return () => {
      alive = false;
    };
  }, []);

  function confirmClose(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitting || !summary || summary.openAccountCount > 0) return;
    setError(null);
    setSubmitting(true);
    shiftApi
      .closeRegister({ countedAmount: normalizeAmount(counted) })
      .then((r) => setClosed(r))
      .catch((err) => setError(err instanceof ApiError ? err.message : OFFLINE))
      .finally(() => setSubmitting(false));
  }

  function endOperation(): void {
    if (ending) return;
    setError(null);
    setEnding(true);
    shiftApi
      .closeSession()
      .then(() => refresh()) // operação encerrada → Home volta a "sem operação"
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : OFFLINE);
        setEnding(false);
      });
  }

  // Caixa fechado → mostra diferença e oferece encerrar a operação.
  if (closed) {
    const diff = Number(closed.difference);
    const diffStyle = diff < 0 ? styles.diffNeg : styles.diffPos;
    return (
      <section style={styles.card} aria-labelledby={`${id}-done`}>
        <StatusPill label="Caixa fechado" />
        <h2 id={`${id}-done`} style={{ ...styles.cardTitle, marginTop: 'var(--tj-space-3)' }}>
          Fechamento concluído
        </h2>
        <dl style={styles.summaryGrid}>
          <SummaryRow label="Esperado" value={formatBRL(closed.expectedAmount)} />
          <SummaryRow label="Contado" value={formatBRL(closed.countedAmount)} />
          <div style={styles.summaryItem}>
            <dt style={styles.infoLabel}>Diferença</dt>
            <dd style={{ ...styles.summaryValueNum, ...diffStyle }}>{formatBRL(closed.difference)}</dd>
          </div>
        </dl>
        {error ? (
          <p role="alert" style={styles.error}>
            {error}
          </p>
        ) : null}
        <div style={styles.closeActions}>
          <button
            type="button"
            onClick={endOperation}
            disabled={ending}
            style={{ ...styles.cta, ...(ending ? styles.ctaBusy : null) }}
            className="tj-press"
          >
            {ending ? 'Encerrando…' : 'Encerrar operação'}
          </button>
          <button
            type="button"
            onClick={() => void refresh().then(onDone)}
            disabled={ending}
            style={styles.ghostButtonWide}
            className="tj-press"
          >
            Manter operação aberta
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={styles.card} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} style={styles.cardTitle}>
        Fechar caixa
      </h2>
      {loadError ? (
        <p role="alert" style={styles.error}>
          {loadError}
        </p>
      ) : !summary ? (
        <p style={styles.cardHelp} aria-live="polite">
          Calculando o esperado…
        </p>
      ) : (
        <>
          <dl style={styles.summaryGrid}>
            <SummaryRow label="Abertura" value={formatBRL(summary.openingAmount)} />
            <SummaryRow label="Recebido em dinheiro" value={formatBRL(summary.cashReceipts)} />
            <div style={styles.summaryItem}>
              <dt style={styles.infoLabel}>Esperado na gaveta</dt>
              <dd style={styles.summaryValueNum}>{formatBRL(summary.expectedAmount)}</dd>
            </div>
          </dl>

          {summary.openAccountCount > 0 ? (
            <p role="alert" style={styles.warn}>
              Há {summary.openAccountCount} conta(s) aberta(s) na operação. Pague ou cancele antes de
              fechar o caixa.
            </p>
          ) : (
            <form style={styles.form} onSubmit={confirmClose} noValidate>
              <div style={styles.field}>
                <label htmlFor={`${id}-counted`} style={styles.label}>
                  Valor contado na gaveta
                </label>
                <div style={styles.amountWrap}>
                  <span aria-hidden="true" style={styles.amountPrefix}>
                    R$
                  </span>
                  <input
                    id={`${id}-counted`}
                    type="text"
                    inputMode="decimal"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    autoFocus
                    placeholder="0,00"
                    disabled={submitting}
                    style={{ ...styles.input, ...styles.amountInput }}
                    className="tj-input"
                  />
                </div>
              </div>
              {error ? (
                <p role="alert" style={styles.error}>
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={submitting || counted.trim() === ''}
                style={{
                  ...styles.cta,
                  ...(submitting || counted.trim() === '' ? styles.ctaBusy : null),
                }}
                className="tj-press"
              >
                {submitting ? 'Fechando…' : 'Confirmar fechamento'}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}

/** Encerra a operação (RB-007/007b). Confirma; 409 se houver caixa/conta aberta. */
function EndOperationPanel({
  refresh,
  onCancel,
}: {
  refresh: () => Promise<void>;
  onCancel: () => void;
}): React.JSX.Element {
  const id = useId();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function confirm(): void {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    shiftApi
      .closeSession()
      .then(() => refresh()) // sucesso → Home volta a "sem operação"
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : OFFLINE);
        setSubmitting(false);
      });
  }

  return (
    <section style={styles.card} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} style={styles.cardTitle}>
        Encerrar operação
      </h2>
      <p style={styles.cardHelp}>
        Encerra o período operacional. Exige todos os caixas fechados e nenhuma conta aberta.
      </p>
      {error ? (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      ) : null}
      <div style={styles.closeActions}>
        <button
          type="button"
          onClick={confirm}
          disabled={submitting}
          style={{ ...styles.ctaDanger, ...(submitting ? styles.ctaBusy : null) }}
          className="tj-press"
        >
          {submitting ? 'Encerrando…' : 'Encerrar operação'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          style={styles.ghostButtonWide}
          className="tj-press"
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={styles.summaryItem}>
      <dt style={styles.infoLabel}>{label}</dt>
      <dd style={styles.summaryValueNum}>{value}</dd>
    </div>
  );
}

function EmployeeLaunch({ sessionName }: { sessionName: string }): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <Centered>
      <section style={styles.card}>
        <StatusPill label="Operação aberta" />
        <h1 style={{ ...styles.cardTitle, marginTop: 'var(--tj-space-3)' }}>Pronto para lançar</h1>
        <p style={styles.cardHelp}>
          A operação "{sessionName}" está aberta. Informe a conta e comece o pedido.
        </p>
        <button type="button" onClick={() => navigate('/lancar')} style={styles.cta} className="tj-press">
          Lançar pedido
        </button>
      </section>
    </Centered>
  );
}

function StatusPill({
  label,
  tone = 'open',
}: {
  label: string;
  tone?: 'open' | 'neutral';
}): React.JSX.Element {
  const isOpen = tone === 'open';
  return (
    <span style={{ ...styles.pill, ...(isOpen ? styles.pillOpen : styles.pillNeutral) }}>
      <span
        aria-hidden="true"
        style={{ ...styles.pillDot, background: isOpen ? 'var(--tj-olive)' : 'var(--tj-faint)' }}
      />
      {label}
    </span>
  );
}

function Centered({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div style={styles.centered}>{children}</div>;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const ROLE_LABEL: Record<Role, string> = {
  [Role.EMPLOYEE]: 'Garçom',
  [Role.CASHIER]: 'Caixa',
  [Role.ADMIN]: 'Administrador',
};

const OFFLINE = 'Sem conexão com o servidor. Verifique a rede e tente de novo.';

function messageFor(err: ApiError, fallback: string): string {
  if (err.status === 409) return err.message; // a API já devolve mensagem de negócio em PT
  return fallback;
}

/** "100,00" (pt-BR) ou "100.00" → string decimal canônica com ponto. */
function normalizeAmount(raw: string): string {
  const t = raw.trim();
  if (t.includes(',')) return t.replace(/\./g, '').replace(',', '.');
  return t;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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
    padding: 'var(--tj-space-3) var(--tj-space-4)',
    background: 'var(--tj-surface)',
    borderBottom: '1px solid var(--tj-hairline)',
  },
  brand: { display: 'flex', flexDirection: 'column', lineHeight: 1.1 },
  wordmark: {
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '22px',
    letterSpacing: '-0.3px',
    color: 'var(--tj-ink)',
  },
  eyebrow: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  identity: { display: 'flex', alignItems: 'center', gap: 'var(--tj-space-3)' },
  userBlock: { display: 'flex', alignItems: 'center', gap: 'var(--tj-space-2)' },
  userName: { fontSize: '14px', fontWeight: 600, color: 'var(--tj-body)' },
  roleChip: {
    fontSize: '12px',
    fontWeight: 600,
    padding: '2px 10px',
    borderRadius: 'var(--tj-radius-pill)',
    color: 'var(--tj-cta)',
    background: 'var(--tj-pale)',
  },
  main: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '960px',
    margin: '0 auto',
    padding: 'var(--tj-space-5) var(--tj-space-4)',
  },

  centered: { display: 'grid', placeItems: 'center', minHeight: '60vh' },
  loading: { fontSize: '15px', color: 'var(--tj-muted)' },

  card: {
    width: '100%',
    maxWidth: '420px',
    boxSizing: 'border-box',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius)',
    boxShadow: '0 1px 2px rgba(26, 27, 18, 0.06)',
    padding: 'var(--tj-space-5)',
  },
  cardEyebrow: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  cardStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--tj-space-2)',
    marginBottom: 'var(--tj-space-3)',
  },
  cardStatusName: { fontSize: '14px', fontWeight: 600, color: 'var(--tj-body)' },
  cardTitle: {
    margin: 'var(--tj-space-1) 0 var(--tj-space-2)',
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '28px',
    lineHeight: 1.15,
    letterSpacing: '-0.3px',
    color: 'var(--tj-ink)',
  },
  cardHelp: {
    margin: '0 0 var(--tj-space-4)',
    fontSize: '15px',
    lineHeight: 1.5,
    color: 'var(--tj-muted)',
    maxWidth: '52ch',
  },
  form: { display: 'grid', gap: 'var(--tj-space-3)' },
  field: { display: 'grid', gap: 'var(--tj-space-1)' },
  label: { fontSize: '14px', fontWeight: 500, color: 'var(--tj-body)' },
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
  amountWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  amountPrefix: {
    position: 'absolute',
    left: 'var(--tj-space-3)',
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--tj-muted)',
    pointerEvents: 'none',
  },
  amountInput: { paddingLeft: '44px', fontVariantNumeric: 'tabular-nums' },
  error: {
    margin: 0,
    padding: 'var(--tj-space-2) var(--tj-space-3)',
    fontSize: '14px',
    fontWeight: 500,
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
  ctaBusy: { opacity: 0.7, cursor: 'progress' },

  ghostButton: {
    minHeight: '44px',
    padding: '0 var(--tj-space-3)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--tj-body)',
    background: 'transparent',
    border: '1px solid var(--tj-hairline-strong)',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
    transition: 'transform 80ms ease, border-color 120ms ease, background 120ms ease',
  },
  ghostButtonWide: {
    marginTop: 'var(--tj-space-4)',
    minHeight: '46px',
    width: '100%',
    padding: '0 var(--tj-space-4)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--tj-body)',
    background: 'transparent',
    border: '1px solid var(--tj-hairline-strong)',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
    transition: 'transform 80ms ease, border-color 120ms ease, background 120ms ease',
  },

  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    fontSize: '13px',
    fontWeight: 600,
    padding: '4px 12px 4px 10px',
    borderRadius: 'var(--tj-radius-pill)',
  },
  pillOpen: { color: 'var(--tj-cta)', background: 'var(--tj-pale)' },
  pillNeutral: { color: 'var(--tj-muted)', background: 'var(--tj-canvas-soft)' },
  pillDot: { width: '8px', height: '8px', borderRadius: '9999px' },

  dashboard: { display: 'grid', gap: 'var(--tj-space-4)' },
  dashHead: { display: 'grid', gap: 'var(--tj-space-2)', justifyItems: 'start' },
  dashTitle: {
    margin: 0,
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '30px',
    lineHeight: 1.1,
    letterSpacing: '-0.4px',
    color: 'var(--tj-ink)',
  },
  panel: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--tj-space-5)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius)',
    padding: 'var(--tj-space-5)',
    boxShadow: '0 1px 2px rgba(26, 27, 18, 0.06)',
  },
  infoBlock: { display: 'grid', gap: '6px', minWidth: '200px', flex: '1 1 200px' },
  panelDivider: { width: '1px', alignSelf: 'stretch', background: 'var(--tj-hairline)' },
  infoLabel: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  infoValue: {
    margin: 0,
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '24px',
    color: 'var(--tj-ink)',
  },
  infoValueNum: {
    margin: 0,
    fontSize: '26px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--tj-ink)',
  },
  infoMeta: { margin: 0, fontSize: '13px', color: 'var(--tj-muted)' },

  closeActions: { display: 'grid', gap: 'var(--tj-space-2)', marginTop: 'var(--tj-space-2)' },
  summaryGrid: {
    margin: '0 0 var(--tj-space-3)',
    display: 'grid',
    gap: 'var(--tj-space-2)',
  },
  summaryItem: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-3)',
  },
  summaryValueNum: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--tj-ink)',
  },
  diffPos: { color: 'var(--tj-olive)' },
  diffNeg: { color: 'var(--tj-danger-text)' },
  warn: {
    margin: 'var(--tj-space-1) 0 0',
    padding: 'var(--tj-space-2) var(--tj-space-3)',
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: 1.45,
    color: 'var(--tj-danger-text)',
    background: 'var(--tj-danger-pale)',
    borderRadius: 'var(--tj-radius-input)',
  },
  ctaDanger: {
    minHeight: '48px',
    padding: '0 var(--tj-space-4)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--tj-cta-contrast)',
    background: 'var(--tj-danger-text)',
    border: 'none',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
    transition: 'transform 80ms ease, opacity 120ms ease',
  },
};

// Pseudo-estados que estilo inline não cobre: foco visível (ring oliva), placeholder,
// press dos botões, hover do ghost e prefers-reduced-motion.
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
button.tj-press:not(:disabled):hover { border-color: var(--tj-hairline-strong); }
@media (prefers-reduced-motion: reduce) {
  .tj-input, .tj-press { transition: none; }
  .tj-press:not(:disabled):active { transform: none; }
}
`;
