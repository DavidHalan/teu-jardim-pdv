import { useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Role } from '@teu-jardim/shared';
import { useAuth } from '../auth/AuthContext';
import { useShift } from '../shift/useShift';
import { shiftApi } from '../shift/shift-api';
import { ApiError } from '../lib/api';
import { formatBRL } from '../lib/money';
import { Alert, Button, Card, StatusPill, TextField } from '../shared/ui';
import { AccountBoard } from './AccountBoard';

/**
 * Raiz autenticada (rota /) = máquina de turno: sem operação → abrir; sem caixa → abrir
 * caixa; com ambos → redireciona ao Quadro. Garçom sem operação aguarda; com operação vai
 * ao Quadro. O acesso pré-caixa a relatórios/auditoria/estoque agora é a própria sidebar
 * (AppShell), não mais botões neste card (redesign v2 "Terminal").
 */
export function ShiftGate(): React.JSX.Element {
  const { user } = useAuth();
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
      setError(err instanceof ApiError ? messageOrFallback(err, fallback) : OFFLINE);
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

  if (loading) {
    return (
      <Centered>
        <ShiftSkeleton />
        <StatusLive />
      </Centered>
    );
  }

  if (!session) {
    return canOperate ? (
      <OpenSessionForm name={name} onName={setName} submitting={submitting} error={error} onSubmit={openSession} />
    ) : (
      <WaitingCard
        title="Aguardando o turno"
        message="O caixa ainda não abriu a operação. Assim que abrir, você poderá lançar pedidos."
        onRefresh={() => void refresh()}
        disabled={submitting}
      />
    );
  }

  // Operação aberta, caixa ainda não: Caixa/Admin abrem aqui. Garçom vai direto ao Quadro.
  if (!register && canOperate) {
    return (
      <OpenRegisterForm
        sessionName={session.name}
        openingAmount={openingAmount}
        onAmount={setOpeningAmount}
        submitting={submitting}
        error={error}
        onSubmit={openRegister}
      />
    );
  }

  return <Navigate to="/quadro" replace />;
}

/**
 * Quadro de contas (tela principal de atendimento). Requer operação; para Caixa/Admin exige
 * também caixa aberto (o Garçom lança sem caixa). Fora dessas condições, volta à raiz.
 */
export function QuadroPage(): React.JSX.Element {
  const { user } = useAuth();
  const { loading, session, register } = useShift();
  const canOperate = user?.role === Role.CASHIER || user?.role === Role.ADMIN;

  if (loading) {
    return (
      <Centered>
        <ShiftSkeleton />
        <StatusLive />
      </Centered>
    );
  }

  const ready = session && (register || !canOperate);
  if (!ready) return <Navigate to="/" replace />;

  return (
    <section style={styles.dashboard} aria-label="Atendimento">
      <div style={styles.turnoBar}>
        <div style={styles.turnoInfo}>
          <StatusPill label={register ? 'Turno aberto' : 'Operação aberta'} />
          <span style={styles.turnoMeta}>
            {session.name}
            {register ? (
              <>
                {' · Caixa '}
                <span className="tj-tnum">{formatBRL(register.openingAmount)}</span>
                {' · desde '}
                {formatTime(register.openedAt)}
              </>
            ) : null}
          </span>
        </div>
      </div>
      <AccountBoard />
    </section>
  );
}

/* ── Subcomponentes ──────────────────────────────────────────────────────── */

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
  const hasError = error !== null;
  return (
    <Centered>
      <Card style={styles.card} aria-labelledby="gate-open-t">
        <p style={styles.cardEyebrow}>Turno</p>
        <h1 id="gate-open-t" style={styles.cardTitle}>
          Abrir operação
        </h1>
        <p style={styles.cardHelp}>Nenhuma operação aberta. Abra para começar o atendimento do dia.</p>
        <form style={styles.form} onSubmit={onSubmit} noValidate>
          <TextField
            label="Nome da operação"
            id="gate-open-name"
            type="text"
            value={name}
            onChange={(e) => onName(e.target.value)}
            autoFocus
            maxLength={80}
            disabled={submitting}
            aria-invalid={hasError}
            aria-describedby={hasError ? 'gate-open-err' : undefined}
          />
          {hasError ? <Alert id="gate-open-err">{error}</Alert> : null}
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
  const hasError = error !== null;
  return (
    <Centered>
      <Card style={styles.card} aria-labelledby="gate-reg-t">
        <div style={styles.cardStatus}>
          <StatusPill label="Operação aberta" />
          <span style={styles.cardStatusName}>{sessionName}</span>
        </div>
        <h1 id="gate-reg-t" style={styles.cardTitle}>
          Abrir caixa
        </h1>
        <p style={styles.cardHelp}>Informe o valor inicial em dinheiro na gaveta.</p>
        <form style={styles.form} onSubmit={onSubmit} noValidate>
          <TextField
            label="Valor inicial"
            id="gate-reg-amount"
            type="text"
            inputMode="decimal"
            leading="R$"
            value={openingAmount}
            onChange={(e) => onAmount(e.target.value)}
            autoFocus
            placeholder="0,00"
            disabled={submitting}
            aria-invalid={hasError}
            aria-describedby={hasError ? 'gate-reg-err' : undefined}
          />
          {hasError ? <Alert id="gate-reg-err">{error}</Alert> : null}
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

const OFFLINE = 'Sem conexão com o servidor. Verifique a rede e tente de novo.';

function messageOrFallback(err: ApiError, fallback: string): string {
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
  skel: { background: 'var(--tj-surface-1)', borderRadius: 'var(--tj-radius-input)' },

  card: { width: '100%', maxWidth: '420px' },
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
  turnoBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-3)',
  },
  turnoInfo: { display: 'flex', alignItems: 'center', gap: 'var(--tj-space-3)', flexWrap: 'wrap' },
  turnoMeta: { fontSize: '14px', color: 'var(--tj-muted)' },
};
