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
import { Alert, Button, Card, StatusPill, TextField } from '../shared/ui';

/**
 * Tela operacional pós-login do PDV. Máquina de estado do turno: sem operação →
 * abrir operação; com operação sem caixa → abrir caixa; com ambos → dashboard.
 * Estado por vislumbre (cor + forma + texto), calma sob pressão, primeiro dia sem
 * treino. Reusa o sistema visual do Login (creme/oliva/Inter). Caixa/Admin abrem;
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
      <Topbar userName={user?.name ?? ''} role={user?.role} onLogout={logout} />

      <main style={styles.main}>
        {loading ? (
          <Centered>
            <ShiftSkeleton />
            <StatusLive />
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
        <Button variant="secondary" onClick={onLogout} style={styles.compactBtn}>
          Sair
        </Button>
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
      <Card style={styles.card} aria-labelledby={`${id}-t`}>
        <p style={styles.cardEyebrow}>Turno</p>
        <h1 id={`${id}-t`} style={styles.cardTitle}>
          Abrir operação
        </h1>
        <p style={styles.cardHelp}>
          Nenhuma operação aberta. Abra para começar o atendimento do dia.
        </p>
        <form style={styles.form} onSubmit={onSubmit} noValidate>
          <TextField
            label="Nome da operação"
            id={`${id}-name`}
            type="text"
            value={name}
            onChange={(e) => onName(e.target.value)}
            autoFocus
            maxLength={80}
            disabled={submitting}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${id}-err` : undefined}
          />
          {hasError ? <Alert id={`${id}-err`}>{error}</Alert> : null}
          <Button type="submit" busy={submitting} fullWidth>
            {submitting ? 'Abrindo…' : 'Abrir operação'}
          </Button>
        </form>
      </Card>
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
      <Card style={styles.card} aria-labelledby={`${id}-t`}>
        <div style={styles.cardStatus}>
          <StatusPill label="Operação aberta" />
          <span style={styles.cardStatusName}>{sessionName}</span>
        </div>
        <h1 id={`${id}-t`} style={styles.cardTitle}>
          Abrir caixa
        </h1>
        <p style={styles.cardHelp}>Informe o valor inicial em dinheiro na gaveta.</p>
        <form style={styles.form} onSubmit={onSubmit} noValidate>
          <TextField
            label="Valor inicial"
            id={`${id}-amount`}
            type="text"
            inputMode="decimal"
            leading="R$"
            value={openingAmount}
            onChange={(e) => onAmount(e.target.value)}
            autoFocus
            placeholder="0,00"
            disabled={submitting}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${id}-err` : undefined}
          />
          {hasError ? <Alert id={`${id}-err`}>{error}</Alert> : null}
          <Button type="submit" busy={submitting} fullWidth>
            {submitting ? 'Abrindo…' : 'Abrir caixa'}
          </Button>
        </form>
      </Card>
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
      <Card style={styles.card}>
        <StatusPill label="Aguardando" tone="pending" />
        <h1 style={{ ...styles.cardTitle, marginTop: 'var(--tj-space-3)' }}>{title}</h1>
        <p style={styles.cardHelp}>{message}</p>
        <Button variant="secondary" onClick={onRefresh} disabled={disabled} fullWidth>
          Atualizar
        </Button>
      </Card>
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
          <p style={styles.infoValueNum} className="tj-tnum">
            {formatBRL(register.openingAmount)}
          </p>
          <p style={styles.infoMeta}>Valor inicial · aberto às {formatTime(register.openedAt)}</p>
        </div>
      </div>

      <Button onClick={() => navigate('/lancar')} fullWidth>
        Lançar pedido
      </Button>

      <div style={styles.closeActions}>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => setPanel((p) => (p === 'register' ? 'none' : 'register'))}
          aria-expanded={panel === 'register'}
        >
          Fechar caixa
        </Button>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => setPanel((p) => (p === 'operation' ? 'none' : 'operation'))}
          aria-expanded={panel === 'operation'}
        >
          Encerrar operação
        </Button>
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
      <Card style={styles.card} aria-labelledby={`${id}-done`}>
        <StatusPill label="Caixa fechado" tone="ready" />
        <h2 id={`${id}-done`} style={{ ...styles.cardTitle, marginTop: 'var(--tj-space-3)' }}>
          Fechamento concluído
        </h2>
        <dl style={styles.summaryGrid}>
          <SummaryRow label="Esperado" value={formatBRL(closed.expectedAmount)} />
          <SummaryRow label="Contado" value={formatBRL(closed.countedAmount)} />
          <div style={styles.summaryItem}>
            <dt style={styles.infoLabel}>Diferença</dt>
            <dd style={{ ...styles.summaryValueNum, ...diffStyle }} className="tj-tnum">
              {formatBRL(closed.difference)}
            </dd>
          </div>
        </dl>
        {error ? <Alert>{error}</Alert> : null}
        <div style={styles.closeActions}>
          <Button onClick={endOperation} busy={ending} fullWidth>
            {ending ? 'Encerrando…' : 'Encerrar operação'}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => void refresh().then(onDone)}
            disabled={ending}
          >
            Manter operação aberta
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card style={styles.card} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} style={styles.cardTitle}>
        Fechar caixa
      </h2>
      {loadError ? (
        <Alert>{loadError}</Alert>
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
              <dd style={styles.summaryValueNum} className="tj-tnum">
                {formatBRL(summary.expectedAmount)}
              </dd>
            </div>
          </dl>

          {summary.openAccountCount > 0 ? (
            <Alert tone="warn">
              Há {summary.openAccountCount} conta(s) aberta(s) na operação. Pague ou cancele antes de
              fechar o caixa.
            </Alert>
          ) : (
            <form style={styles.form} onSubmit={confirmClose} noValidate>
              <TextField
                label="Valor contado na gaveta"
                id={`${id}-counted`}
                type="text"
                inputMode="decimal"
                leading="R$"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                autoFocus
                placeholder="0,00"
                disabled={submitting}
              />
              {error ? <Alert>{error}</Alert> : null}
              <Button
                type="submit"
                busy={submitting}
                disabled={counted.trim() === ''}
                fullWidth
              >
                {submitting ? 'Fechando…' : 'Confirmar fechamento'}
              </Button>
            </form>
          )}
        </>
      )}
    </Card>
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
    <Card style={styles.card} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} style={styles.cardTitle}>
        Encerrar operação
      </h2>
      <p style={styles.cardHelp}>
        Encerra o período operacional. Exige todos os caixas fechados e nenhuma conta aberta.
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <div style={styles.closeActions}>
        <Button variant="danger" onClick={confirm} busy={submitting} fullWidth>
          {submitting ? 'Encerrando…' : 'Encerrar operação'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={submitting} fullWidth>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div style={styles.summaryItem}>
      <dt style={styles.infoLabel}>{label}</dt>
      <dd style={styles.summaryValueNum} className="tj-tnum">
        {value}
      </dd>
    </div>
  );
}

function EmployeeLaunch({ sessionName }: { sessionName: string }): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <Centered>
      <Card style={styles.card}>
        <StatusPill label="Operação aberta" />
        <h1 style={{ ...styles.cardTitle, marginTop: 'var(--tj-space-3)' }}>Pronto para lançar</h1>
        <p style={styles.cardHelp}>
          A operação "{sessionName}" está aberta. Informe a conta e comece o pedido.
        </p>
        <Button onClick={() => navigate('/lancar')} fullWidth>
          Lançar pedido
        </Button>
      </Card>
    </Centered>
  );
}

/** Skeleton de carregamento do turno (register product: skeleton, não spinner). */
function ShiftSkeleton(): React.JSX.Element {
  return (
    <Card style={styles.card} aria-hidden="true">
      <div style={{ ...styles.skel, width: '40%', height: '14px' }} />
      <div style={{ ...styles.skel, width: '70%', height: '28px', marginTop: 'var(--tj-space-3)' }} />
      <div style={{ ...styles.skel, width: '90%', height: '14px', marginTop: 'var(--tj-space-3)' }} />
      <div style={{ ...styles.skel, width: '100%', height: '46px', marginTop: 'var(--tj-space-4)' }} />
    </Card>
  );
}

function StatusLive(): React.JSX.Element {
  return (
    <span style={styles.srOnly} role="status" aria-live="polite">
      Carregando turno
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

/* ── Estilos (layout; vocabulário interativo vem de shared/ui + base.css) ──── */

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--tj-canvas)',
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
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '20px',
    letterSpacing: '-0.4px',
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
    color: 'var(--tj-brand-deep)',
    background: 'var(--tj-brand-pale)',
  },
  compactBtn: { minHeight: '44px', padding: '0 var(--tj-space-3)', fontSize: '15px' },
  main: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '960px',
    margin: '0 auto',
    padding: 'var(--tj-space-5) var(--tj-space-4)',
  },

  centered: { display: 'grid', placeItems: 'center', minHeight: '60vh' },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  skel: {
    background: 'var(--tj-canvas-soft)',
    borderRadius: 'var(--tj-radius-input)',
  },

  card: {
    width: '100%',
    maxWidth: '420px',
  },
  cardEyebrow: {
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
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '28px',
    lineHeight: 1.15,
    letterSpacing: '-0.5px',
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

  dashboard: { display: 'grid', gap: 'var(--tj-space-4)' },
  dashHead: { display: 'grid', gap: 'var(--tj-space-2)', justifyItems: 'start' },
  dashTitle: {
    margin: 0,
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '30px',
    lineHeight: 1.1,
    letterSpacing: '-0.6px',
    color: 'var(--tj-ink)',
  },
  panel: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--tj-space-5)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-md)',
    padding: 'var(--tj-space-5)',
    boxShadow: 'var(--tj-shadow-card)',
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
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '24px',
    letterSpacing: '-0.3px',
    color: 'var(--tj-ink)',
  },
  infoValueNum: {
    margin: 0,
    fontSize: '26px',
    fontWeight: 700,
    color: 'var(--tj-ink)',
  },
  infoMeta: { margin: 0, fontSize: '13px', color: 'var(--tj-muted)' },

  closeActions: { display: 'grid', gap: 'var(--tj-space-2)', marginTop: 'var(--tj-space-2)' },
  summaryGrid: { margin: '0 0 var(--tj-space-3)', display: 'grid', gap: 'var(--tj-space-2)' },
  summaryItem: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-3)',
  },
  summaryValueNum: { margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--tj-ink)' },
  diffPos: { color: 'var(--tj-ready-text)' },
  diffNeg: { color: 'var(--tj-danger-text)' },
};
