import { useEffect, useId, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
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
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';
import { Alert, Button, Card, Segmented, StatusPill, TextField } from '../shared/ui';

/**
 * Área "Caixa" (rota /caixa) — movimentações, pagamentos/estorno, fechamento e encerramento
 * da operação. Antes viviam empilhados no dashboard do Home; a IA v2 (redesign Terminal) dá
 * a cada um endereço próprio dentro desta área, escolhidos por um seletor. Só Caixa/Admin com
 * turno completo; senão volta para a raiz (máquina de turno).
 */
export function CashPage(): React.JSX.Element {
  const { loading, session, register, refresh } = useShift();
  const { user } = useAuth();
  const canOperate = user?.role === Role.CASHIER || user?.role === Role.ADMIN;
  const [tab, setTab] = useState<'cash' | 'payments' | 'close' | 'end'>('cash');

  if (loading) {
    return (
      <div style={styles.page}>
        <p style={styles.cardHelp} role="status" aria-live="polite">
          Carregando caixa…
        </p>
      </div>
    );
  }
  if (!session || !register || !canOperate) return <Navigate to="/" replace />;

  return (
    <div style={styles.page}>
      <header style={styles.pageHead}>
        <div>
          <p style={styles.pageEyebrow}>Caixa</p>
          <h1 style={styles.pageTitle}>{session.name}</h1>
        </div>
        <span style={styles.turnoMeta}>
          Abertura <span className="tj-tnum">{formatBRL(register.openingAmount)}</span> · desde{' '}
          {formatTime(register.openedAt)}
        </span>
      </header>

      <Segmented
        ariaLabel="Área do caixa"
        options={[
          { value: 'cash', label: 'Movimentações' },
          { value: 'payments', label: 'Pagamentos' },
          { value: 'close', label: 'Fechamento' },
          { value: 'end', label: 'Encerrar' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'cash' ? (
        <CashMovementsPanel />
      ) : tab === 'payments' ? (
        <PaymentsPanel />
      ) : tab === 'close' ? (
        <CloseRegisterPanel refresh={refresh} onDone={() => setTab('cash')} />
      ) : (
        <EndOperationPanel refresh={refresh} onCancel={() => setTab('cash')} />
      )}
    </div>
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
                <StatusPill label={MOVEMENT_LABEL[m.type]} tone={MOVEMENT_TONE[m.type]} dot={false} />
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
      .then(() => refresh()) // operação encerrada → a raiz volta a "sem operação"
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
              <Button type="submit" busy={submitting} disabled={counted.trim() === ''} fullWidth>
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
      .then(() => refresh()) // sucesso → a raiz volta a "sem operação"
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

/* ── Helpers ─────────────────────────────────────────────────────────────── */

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

/* ── Estilos ─────────────────────────────────────────────────────────────── */

const styles: Record<string, CSSProperties> = {
  page: { display: 'grid', gap: 'var(--tj-space-4)', maxWidth: '640px' },
  pageHead: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-2)',
  },
  pageEyebrow: {
    margin: 0,
    fontSize: 'var(--tj-fs-eyebrow)',
    fontWeight: 600,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  pageTitle: {
    margin: '2px 0 0',
    fontSize: '20px',
    fontWeight: 600,
    letterSpacing: '-0.3px',
    color: 'var(--tj-ink)',
  },
  turnoMeta: { fontSize: '14px', color: 'var(--tj-muted)' },
  compactBtn: { minHeight: '44px', padding: '0 var(--tj-space-3)', fontSize: '15px' },
  infoLabel: {
    margin: 0,
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  closeActions: { display: 'grid', gap: 'var(--tj-space-2)', marginTop: 'var(--tj-space-2)' },

  card: { width: '100%', maxWidth: '420px' },
  cardTitle: {
    margin: 'var(--tj-space-1) 0 var(--tj-space-2)',
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '22px',
    lineHeight: 1.2,
    letterSpacing: '-0.4px',
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
    color: 'var(--tj-ok)',
    background: 'var(--tj-ok-tint)',
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
  cashRowOut: { color: 'var(--tj-warn)' },
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
  diffPos: { color: 'var(--tj-ok)' },
  diffNeg: { color: 'var(--tj-danger)' },
};
