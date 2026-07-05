import { useEffect, useId, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { CashMovementType, PaymentStatus, Role } from '@teu-jardim/shared';
import type {
  CashMovementDto,
  PaymentAccountRef,
  PaymentListItemDto,
  PaymentTenderDto,
  RegisterCloseSummary,
  RegisterClosedDto,
} from '@teu-jardim/shared';
import { useAuth } from '../auth/AuthContext';
import { useShift } from '../shift/useShift';
import { shiftApi } from '../shift/shift-api';
import { paymentsApi } from '../payments/payments-api';
import { ReportsPanel } from '../reports/ReportsPanel';
import { AuditPanel } from '../audit/AuditPanel';
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';
import { Alert, Button, Card, Segmented, StatusPill, TextField, ThemeToggle } from '../shared/ui';
import { AccountBoard } from './AccountBoard';

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
  // Gestor lê relatórios/auditoria sem operar caixa (RB-053a/044) — antes de abrir o caixa.
  const [preScreen, setPreScreen] = useState<'form' | 'reports' | 'audit'>('form');

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
            preScreen !== 'form' ? (
              <section style={styles.dashboard} aria-label="Gestão">
                <div style={styles.turnoActions}>
                  <Button variant="secondary" style={styles.compactBtn} onClick={() => setPreScreen('form')}>
                    ← Voltar
                  </Button>
                </div>
                {preScreen === 'reports' ? (
                  <ReportsPanel role={user?.role ?? Role.CASHIER} />
                ) : (
                  <AuditPanel />
                )}
              </section>
            ) : (
              <OpenRegisterForm
                sessionName={session.name}
                openingAmount={openingAmount}
                onAmount={setOpeningAmount}
                submitting={submitting}
                error={error}
                onSubmit={openRegister}
                onReports={() => setPreScreen('reports')}
                onAudit={user?.role === Role.ADMIN ? () => setPreScreen('audit') : undefined}
              />
            )
          ) : (
            <EmployeeLaunch sessionName={session.name} />
          )
        ) : (
          <Dashboard session={session} register={register} refresh={refresh} role={user?.role} />
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
        <ThemeToggle />
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
  onReports,
  onAudit,
}: {
  sessionName: string;
  openingAmount: string;
  onAmount: (v: string) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onReports: () => void;
  onAudit?: () => void;
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
          <Button variant="secondary" fullWidth onClick={onReports} disabled={submitting}>
            Ver relatórios
          </Button>
          {onAudit ? (
            <Button variant="secondary" fullWidth onClick={onAudit} disabled={submitting}>
              Auditoria
            </Button>
          ) : null}
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
  role,
}: {
  session: { name: string; openedAt: string };
  register: { openingAmount: string; openedAt: string };
  refresh: () => Promise<void>;
  role?: Role;
}): React.JSX.Element {
  // Só um painel aberto por vez. Caixa movimenta, estorna, lê relatórios e fecha daqui.
  const [panel, setPanel] = useState<
    'none' | 'cash' | 'payments' | 'reports' | 'audit' | 'register' | 'operation'
  >('none');
  const toggle = (p: 'cash' | 'payments' | 'reports' | 'audit' | 'register' | 'operation') =>
    setPanel((cur) => (cur === p ? 'none' : p));

  return (
    <section style={styles.dashboard} aria-label="Atendimento">
      <div style={styles.turnoBar}>
        <div style={styles.turnoInfo}>
          <StatusPill label="Turno aberto" />
          <span style={styles.turnoMeta}>
            {session.name} · Caixa{' '}
            <span className="tj-tnum">{formatBRL(register.openingAmount)}</span> · desde{' '}
            {formatTime(register.openedAt)}
          </span>
        </div>
        <div style={styles.turnoActions}>
          <Button
            variant="secondary"
            style={styles.compactBtn}
            onClick={() => toggle('cash')}
            aria-expanded={panel === 'cash'}
          >
            Movimentações
          </Button>
          <Button
            variant="secondary"
            style={styles.compactBtn}
            onClick={() => toggle('payments')}
            aria-expanded={panel === 'payments'}
          >
            Pagamentos
          </Button>
          <Button
            variant="secondary"
            style={styles.compactBtn}
            onClick={() => toggle('reports')}
            aria-expanded={panel === 'reports'}
          >
            Relatórios
          </Button>
          {role === Role.ADMIN ? (
            <Button
              variant="secondary"
              style={styles.compactBtn}
              onClick={() => toggle('audit')}
              aria-expanded={panel === 'audit'}
            >
              Auditoria
            </Button>
          ) : null}
          <Button
            variant="secondary"
            style={styles.compactBtn}
            onClick={() => toggle('register')}
            aria-expanded={panel === 'register'}
          >
            Fechar caixa
          </Button>
          <Button
            variant="secondary"
            style={styles.compactBtn}
            onClick={() => toggle('operation')}
            aria-expanded={panel === 'operation'}
          >
            Encerrar operação
          </Button>
        </div>
      </div>

      {panel === 'cash' ? (
        <CashMovementsPanel />
      ) : panel === 'payments' ? (
        <PaymentsPanel />
      ) : panel === 'reports' ? (
        <ReportsPanel role={role ?? Role.CASHIER} />
      ) : panel === 'audit' ? (
        <AuditPanel />
      ) : panel === 'register' ? (
        <CloseRegisterPanel refresh={refresh} onDone={() => setPanel('none')} />
      ) : panel === 'operation' ? (
        <EndOperationPanel refresh={refresh} onCancel={() => setPanel('none')} />
      ) : (
        <AccountBoard />
      )}
    </section>
  );
}

/**
 * Sangria/Suprimento + conferência da gaveta (RB-010/052). Inline (não modal),
 * confirm-then-display: o movimento só aparece na lista após o servidor confirmar.
 */
function CashMovementsPanel(): React.JSX.Element {
  const id = useId();
  const [kind, setKind] = useState<'WITHDRAWAL' | 'SUPPLY'>('WITHDRAWAL');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CashMovementDto | null>(null);
  const [movements, setMovements] = useState<CashMovementDto[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function loadMovements(): Promise<void> {
    try {
      const res = await shiftApi.movements();
      setMovements(res.movements);
      setListError(null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : OFFLINE);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount é o read-snapshot decidido (ADR-0023); TanStack Query assume no retrofit (R-TS3).
    void loadMovements();
  }, []);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSaved(null);
    setSubmitting(true);
    const body = { amount: normalizeAmount(amount), reason: reason.trim() };
    const call = kind === 'WITHDRAWAL' ? shiftApi.registerWithdrawal : shiftApi.registerSupply;
    call(body)
      .then(async (m) => {
        setSaved(m);
        setAmount('');
        setReason('');
        await loadMovements();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : OFFLINE))
      .finally(() => setSubmitting(false));
  }

  const verb = kind === 'WITHDRAWAL' ? 'Registrar sangria' : 'Registrar suprimento';

  return (
    <Card style={styles.cashCard} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} style={styles.cardTitle}>
        Movimentações do caixa
      </h2>
      <p style={styles.cardHelp}>
        Sangria retira dinheiro da gaveta; suprimento acrescenta. Tudo entra no esperado do
        fechamento e fica auditado.
      </p>

      <form style={styles.form} onSubmit={submit} noValidate>
        <Segmented
          ariaLabel="Tipo de movimentação"
          options={[
            { value: 'WITHDRAWAL', label: 'Sangria' },
            { value: 'SUPPLY', label: 'Suprimento' },
          ]}
          value={kind}
          onChange={(v) => {
            setKind(v);
            setSaved(null);
          }}
        />
        <div style={styles.cashFields}>
          <TextField
            label="Valor"
            id={`${id}-amount`}
            type="text"
            inputMode="decimal"
            leading="R$"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0,00"
            disabled={submitting}
          />
          <TextField
            label="Motivo"
            id={`${id}-reason`}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={kind === 'WITHDRAWAL' ? 'Ex.: depósito no banco' : 'Ex.: fundo de troco'}
            maxLength={200}
            disabled={submitting}
          />
        </div>
        {error ? <Alert>{error}</Alert> : null}
        {saved ? (
          <p style={styles.cashSaved} role="status">
            {saved.type === CashMovementType.WITHDRAWAL ? 'Sangria registrada' : 'Suprimento registrado'}:{' '}
            <strong className="tj-tnum">{formatBRL(saved.amount)}</strong>
          </p>
        ) : null}
        <Button
          type="submit"
          busy={submitting}
          disabled={amount.trim() === '' || reason.trim() === ''}
          fullWidth
        >
          {submitting ? 'Registrando…' : verb}
        </Button>
      </form>

      <h3 style={styles.cashListTitle}>Nesta gaveta</h3>
      {listError ? (
        <Alert>{listError}</Alert>
      ) : movements === null ? (
        <p style={styles.cardHelp} aria-live="polite">
          Carregando movimentações…
        </p>
      ) : movements.length === 0 ? (
        <p style={styles.cardHelp}>
          Nenhuma movimentação ainda. Vendas em dinheiro, sangrias e suprimentos aparecem aqui.
        </p>
      ) : (
        <ul style={styles.cashList} aria-label="Movimentações do caixa">
          {movements.map((m) => (
            <li key={m.id} style={styles.cashRow}>
              <span style={styles.cashRowTime} className="tj-tnum">
                {formatTime(m.createdAt)}
              </span>
              <span style={styles.cashRowMain}>
                <StatusPill
                  label={MOVEMENT_LABEL[m.type]}
                  tone={MOVEMENT_TONE[m.type]}
                  dot={false}
                />
                {m.reason ? <span style={styles.cashRowReason}>{m.reason}</span> : null}
              </span>
              <span
                style={{
                  ...styles.cashRowAmount,
                  ...(OUTFLOW.has(m.type) ? styles.cashRowOut : null),
                }}
                className="tj-tnum"
              >
                {OUTFLOW.has(m.type) ? '−' : '+'}
                {formatBRL(m.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * Pagamentos da operação corrente + estorno (RB-048/049/050). Inline (não modal),
 * confirm-then-display: estorno pede motivo e o resultado só aparece após o servidor
 * confirmar. Estornar NÃO apaga — o pagamento fica na lista como Estornado.
 */
function PaymentsPanel(): React.JSX.Element {
  const id = useId();
  const [payments, setPayments] = useState<PaymentListItemDto[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [reversing, setReversing] = useState<string | null>(null); // pagamento com o motivo aberto
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      const res = await paymentsApi.list();
      setPayments(res.payments);
      setListError(null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : OFFLINE);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount é o read-snapshot decidido (ADR-0023); TanStack Query assume no retrofit (R-TS3).
    void load();
  }, []);

  function toggleReverse(paymentId: string): void {
    setReversing((cur) => (cur === paymentId ? null : paymentId));
    setReason('');
    setError(null);
    setDone(null);
  }

  function confirmReverse(event: FormEvent<HTMLFormElement>, p: PaymentListItemDto): void {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    paymentsApi
      .reverse(p.id, { reason: reason.trim() })
      .then(async () => {
        setDone(`Estorno registrado: ${accountsLabel(p.accounts)} de volta ao quadro.`);
        setReversing(null);
        setReason('');
        await load();
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? messageFor(err, 'Não foi possível estornar. Tente novamente.')
            : OFFLINE,
        ),
      )
      .finally(() => setSubmitting(false));
  }

  return (
    <Card style={styles.cashCard} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} style={styles.cardTitle}>
        Pagamentos da operação
      </h2>
      <p style={styles.cardHelp}>
        Estornar reabre a conta para correção e, na parcela em dinheiro, devolve o valor pela
        gaveta. O pagamento original fica registrado.
      </p>

      {done ? (
        <p style={styles.cashSaved} role="status">
          {done}
        </p>
      ) : null}

      {listError ? (
        <Alert>{listError}</Alert>
      ) : payments === null ? (
        <p style={styles.cardHelp} aria-live="polite">
          Carregando pagamentos…
        </p>
      ) : payments.length === 0 ? (
        <p style={styles.cardHelp}>
          Nenhum pagamento nesta operação ainda. Contas pagas aparecem aqui e podem ser estornadas.
        </p>
      ) : (
        <ul style={styles.cashList} aria-label="Pagamentos da operação">
          {payments.map((p) => (
            <li key={p.id} style={styles.payItem}>
              <div style={styles.cashRow}>
                <span style={styles.cashRowTime} className="tj-tnum">
                  {formatTime(p.createdAt)}
                </span>
                <span style={styles.cashRowMain}>
                  <span style={styles.payAccounts}>{accountsLabel(p.accounts)}</span>
                  <span style={styles.payMethods}>{methodsLabel(p.tenders)}</span>
                </span>
                <StatusPill
                  label={p.status === PaymentStatus.REVERSED ? 'Estornado' : 'Pago'}
                  tone={p.status === PaymentStatus.REVERSED ? 'cooking' : 'ready'}
                  dot={false}
                />
                <span style={styles.cashRowAmount} className="tj-tnum">
                  {formatBRL(p.total)}
                </span>
                {p.status === PaymentStatus.SETTLED ? (
                  <Button
                    variant="secondary"
                    style={styles.compactBtn}
                    onClick={() => toggleReverse(p.id)}
                    aria-expanded={reversing === p.id}
                  >
                    Estornar
                  </Button>
                ) : null}
              </div>
              {reversing === p.id ? (
                <form
                  style={styles.payReverseForm}
                  onSubmit={(e) => confirmReverse(e, p)}
                  noValidate
                >
                  <TextField
                    label="Motivo do estorno"
                    id={`${id}-reason`}
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ex.: cobrança errada"
                    maxLength={200}
                    autoFocus
                    disabled={submitting}
                  />
                  {error ? <Alert>{error}</Alert> : null}
                  <div style={styles.payReverseActions}>
                    <Button type="submit" variant="danger" busy={submitting} disabled={reason.trim() === ''}>
                      {submitting ? 'Estornando…' : 'Confirmar estorno'}
                    </Button>
                    <Button variant="secondary" onClick={() => setReversing(null)} disabled={submitting}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
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
            <SummaryRow label="Suprimentos" value={`+${formatBRL(summary.cashSupplies)}`} />
            <SummaryRow label="Sangrias" value={`−${formatBRL(summary.cashWithdrawals)}`} />
            <SummaryRow label="Estornos" value={`−${formatBRL(summary.cashReversals)}`} />
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
  return (
    <section style={styles.dashboard} aria-label="Atendimento">
      <div style={styles.turnoBar}>
        <div style={styles.turnoInfo}>
          <StatusPill label="Operação aberta" />
          <span style={styles.turnoMeta}>{sessionName}</span>
        </div>
      </div>
      <AccountBoard />
    </section>
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

const MOVEMENT_LABEL: Record<CashMovementType, string> = {
  [CashMovementType.SALE_RECEIPT]: 'Venda',
  [CashMovementType.WITHDRAWAL]: 'Sangria',
  [CashMovementType.SUPPLY]: 'Suprimento',
  [CashMovementType.PAYMENT_REVERSAL]: 'Estorno',
};

// Semântica de fluxo (cor + sinal + rótulo, nunca matiz só): entrada = ready,
// saída = cooking (atenção, não erro), venda = neutro frequente.
const MOVEMENT_TONE: Record<CashMovementType, 'ready' | 'cooking' | 'pending'> = {
  [CashMovementType.SALE_RECEIPT]: 'pending',
  [CashMovementType.WITHDRAWAL]: 'cooking',
  [CashMovementType.SUPPLY]: 'ready',
  [CashMovementType.PAYMENT_REVERSAL]: 'cooking',
};

// Dinheiro que SAI da gaveta (sinal − na lista): sangria e estorno (RB-010/049).
const OUTFLOW = new Set<CashMovementType>([
  CashMovementType.WITHDRAWAL,
  CashMovementType.PAYMENT_REVERSAL,
]);

const TAB_SINGULAR: Record<string, string> = {
  WRISTBAND: 'Pulseira',
  COMANDA: 'Comanda',
  TABLE: 'Mesa',
};

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CREDIT: 'Crédito',
  DEBIT: 'Débito',
};

function accountsLabel(accounts: PaymentAccountRef[]): string {
  return accounts.map((a) => `${TAB_SINGULAR[a.tabType]} ${a.number}`).join(', ');
}

function methodsLabel(tenders: PaymentTenderDto[]): string {
  return tenders.map((t) => METHOD_LABEL[t.method]).join(' + ');
}

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
  turnoBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-3)',
  },
  turnoInfo: { display: 'flex', alignItems: 'center', gap: 'var(--tj-space-3)', flexWrap: 'wrap' },
  turnoMeta: { fontSize: '14px', color: 'var(--tj-muted)' },
  turnoActions: { display: 'flex', gap: 'var(--tj-space-2)', flexWrap: 'wrap' },
  infoLabel: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },

  closeActions: { display: 'grid', gap: 'var(--tj-space-2)', marginTop: 'var(--tj-space-2)' },

  cashCard: { width: '100%', maxWidth: '560px' },
  cashFields: {
    display: 'grid',
    gridTemplateColumns: 'minmax(120px, 160px) 1fr',
    gap: 'var(--tj-space-3)',
  },
  cashSaved: {
    margin: 0,
    padding: 'var(--tj-space-2) var(--tj-space-3)',
    fontSize: 'var(--tj-fs-body-sm)',
    fontWeight: 500,
    borderRadius: 'var(--tj-radius-input)',
    color: 'var(--tj-ready-text)',
    background: 'var(--tj-ready-pale)',
  },
  cashListTitle: {
    margin: 'var(--tj-space-4) 0 var(--tj-space-2)',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  cashList: { listStyle: 'none', margin: 0, padding: 0, display: 'grid' },
  cashRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--tj-space-3)',
    padding: 'var(--tj-space-2) 0',
    borderTop: '1px solid var(--tj-hairline)',
  },
  cashRowTime: { fontSize: '13px', color: 'var(--tj-faint)', minWidth: '42px' },
  cashRowMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--tj-space-2)',
    flex: 1,
    minWidth: 0,
    flexWrap: 'wrap',
  },
  cashRowReason: {
    fontSize: '14px',
    color: 'var(--tj-body)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cashRowAmount: { fontSize: '16px', fontWeight: 600, color: 'var(--tj-ink)' },
  cashRowOut: { color: 'var(--tj-cooking-text)' },
  payItem: { display: 'grid' },
  payAccounts: { fontSize: '14px', fontWeight: 600, color: 'var(--tj-body)' },
  payMethods: { fontSize: '13px', color: 'var(--tj-faint)' },
  payReverseForm: {
    display: 'grid',
    gap: 'var(--tj-space-2)',
    padding: '0 0 var(--tj-space-3)',
    paddingLeft: 'calc(42px + var(--tj-space-3))',
  },
  payReverseActions: { display: 'flex', gap: 'var(--tj-space-2)', flexWrap: 'wrap' },
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
