import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Navigate, useParams, useNavigate } from 'react-router-dom';
import type { AccountDto, AccountSummaryDto } from '@teu-jardim/shared';
import { PaymentMethod, Role } from '@teu-jardim/shared';
import { useAuth } from '../auth/AuthContext';
import { accountsApi } from '../accounts/accounts-api';
import { paymentsApi } from '../payments/payments-api';
import { remaining, isExactlyPaid, sumTotals, toTenderRequest } from '../payments/tenders';
import type { TenderRow } from '../payments/tenders';
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';
import { Alert, Button, Card, ScreenHeader, Segmented, StatusPill } from '../shared/ui';

/**
 * Tela de pagamento (PRD §12 passo 7, RB-037). Caixa monta formas de pagamento
 * (split em múltiplos métodos) e confirma quando o total bateu exatamente.
 * Atalho "Pagar tudo em dinheiro" define uma única linha CASH = total da conta.
 */
export function PayScreen(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [account, setAccount] = useState<AccountDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<TenderRow[]>([{ method: PaymentMethod.CASH, amount: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ labels: string; total: string } | null>(null);
  // Agrupamento (F-5, RB-035/036): contas extras pagas junto; total = soma-com-desconto.
  const [extras, setExtras] = useState<AccountSummaryDto[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTargets, setPickerTargets] = useState<AccountSummaryDto[] | null>(null);

  useEffect(() => {
    let alive = true;
    if (id) {
      accountsApi
        .get(id)
        .then((a) => {
          if (alive) setAccount(a);
        })
        .catch(() => {
          if (alive) setLoadError('Não foi possível carregar a conta. Verifique a rede.');
        });
    }
    return () => {
      alive = false;
    };
  }, [id]);

  // Pagar é do caixa (RB-041). Defense-in-depth no front: garçom que digitar a URL
  // direto volta ao início (o back já rejeita o POST /payments com 403).
  if (user && user.role !== Role.CASHIER && user.role !== Role.ADMIN) {
    return <Navigate to="/" replace />;
  }

  function setRowMethod(idx: number, method: PaymentMethod): void {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, method } : r)));
  }

  function setRowAmount(idx: number, amount: string): void {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, amount } : r)));
  }

  function addRow(): void {
    setRows((prev) => [...prev, { method: PaymentMethod.CASH, amount: '' }]);
  }

  function removeRow(idx: number): void {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  const groupTotal = account ? sumTotals([account.total, ...extras.map((e) => e.total)]) : '0.00';

  function payAllCash(): void {
    if (!account) return;
    setRows([{ method: PaymentMethod.CASH, amount: groupTotal }]);
  }

  function openPicker(): void {
    setShowPicker((cur) => !cur);
    accountsApi
      .list()
      .then((res) =>
        setPickerTargets(
          res.accounts.filter((a) => a.id !== id && !extras.some((e) => e.id === a.id)),
        ),
      )
      .catch(() => setError('Não foi possível listar as contas abertas.'));
  }

  function addExtra(target: AccountSummaryDto): void {
    setExtras((prev) => [...prev, target]);
    setShowPicker(false);
    setRows([{ method: PaymentMethod.CASH, amount: '' }]); // total mudou → remonta o split
  }

  function removeExtra(accountId: string): void {
    setExtras((prev) => prev.filter((e) => e.id !== accountId));
    setRows([{ method: PaymentMethod.CASH, amount: '' }]);
  }

  function confirm(): void {
    if (!account || submitting) return;
    setError(null);
    setSubmitting(true);
    const labels = [accountLabel(account), ...extras.map((e) => summaryLabel(e))].join(', ');
    const total = groupTotal;
    paymentsApi
      .pay({ accountIds: [id, ...extras.map((e) => e.id)], tenders: toTenderRequest(rows) })
      .then(() => setDone({ labels, total }))
      .catch((err) => {
        setError(
          err instanceof ApiError && (err.status === 400 || err.status === 409)
            ? err.message
            : 'Não foi possível registrar o pagamento. Tente novamente.',
        );
        setSubmitting(false);
      });
  }

  // — Success view
  if (done) {
    return (
      <div style={styles.page}>
        <main style={styles.centeredMain}>
          <Card style={styles.successCard}>
            <StatusPill label={extras.length > 0 ? 'Contas pagas' : 'Conta paga'} tone="ready" />
            <h1 style={styles.displayTitle}>{done.labels}</h1>
            <div style={styles.paidTotalRow}>
              <span style={styles.summaryLabel}>Total pago</span>
              <span style={styles.displayAmount} className="tj-tnum">
                {formatBRL(done.total)}
              </span>
            </div>
            <div style={styles.doneActions}>
              <Button variant="secondary" fullWidth onClick={() => navigate('/')}>
                Nova conta
              </Button>
              <Button fullWidth onClick={() => navigate('/')}>
                Voltar ao início
              </Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  // — Load error
  if (loadError) {
    return (
      <div style={styles.page}>
        <ScreenHeader onBack={() => navigate(-1)} backLabel="Voltar" />
        <div style={styles.stateBox}>
          <p style={styles.stateMsg}>{loadError}</p>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  // — Loading
  if (!account) {
    return (
      <div style={styles.page}>
        <ScreenHeader onBack={() => navigate(-1)} backLabel="Voltar" />
        <p style={styles.stateMsg} aria-live="polite">
          Carregando conta…
        </p>
      </div>
    );
  }

  const rem = remaining(groupTotal, rows);
  const remNegative = rem.startsWith('-');
  const exactlyPaid = isExactlyPaid(groupTotal, rows);

  return (
    <div style={styles.page}>
      <ScreenHeader
        onBack={() => navigate(-1)}
        backLabel={accountLabel(account)}
        title="Pagamento"
        sticky
      />

      <main style={styles.main}>
        {/* Resumo da conta */}
        <Card style={styles.card}>
          <div style={styles.accountHeader}>
            <span style={styles.accountName}>{accountLabel(account)}</span>
            {account.discountTotal !== '0.00' ? (
              <div style={styles.discountRow}>
                <span style={styles.summaryLabel}>Subtotal</span>
                <span style={styles.discountValue} className="tj-tnum">
                  {formatBRL(account.subtotal)}
                </span>
              </div>
            ) : null}
            {account.discountTotal !== '0.00' ? (
              <div style={styles.discountRow}>
                <span style={styles.summaryLabel}>Desconto</span>
                <span style={styles.discountAmount} className="tj-tnum">
                  − {formatBRL(account.discountTotal)}
                </span>
              </div>
            ) : null}
            <div style={styles.totalRow}>
              <span style={styles.totalLabel}>{extras.length > 0 ? 'Conta' : 'Total'}</span>
              <span style={styles.totalAmount} className="tj-tnum">
                {formatBRL(account.total)}
              </span>
            </div>
          </div>

          {/* Agrupamento (RB-035/036): soma dos totais-com-desconto; sem desconto sobre o grupo */}
          {extras.map((e) => (
            <div key={e.id} style={styles.groupRow}>
              <span style={styles.groupLabel}>{summaryLabel(e)}</span>
              <span style={styles.groupValue} className="tj-tnum">
                {formatBRL(e.total)}
              </span>
              <button
                type="button"
                onClick={() => removeExtra(e.id)}
                style={styles.removeBtn}
                className="tj-press"
                aria-label={`Tirar ${summaryLabel(e)} do pagamento`}
              >
                ×
              </button>
            </div>
          ))}

          {extras.length > 0 ? (
            <div style={styles.groupTotalRow}>
              <span style={styles.totalLabel}>Total do grupo</span>
              <span style={styles.totalAmount} className="tj-tnum">
                {formatBRL(groupTotal)}
              </span>
            </div>
          ) : null}

          <button type="button" onClick={openPicker} style={styles.addRow} className="tj-press" aria-expanded={showPicker}>
            + Adicionar conta a este pagamento
          </button>

          {showPicker ? (
            pickerTargets === null ? (
              <p style={styles.pickerEmpty} aria-live="polite">
                Carregando contas abertas…
              </p>
            ) : pickerTargets.length === 0 ? (
              <p style={styles.pickerEmpty}>Nenhuma outra conta aberta para agrupar.</p>
            ) : (
              <div style={styles.pickerGrid} aria-label="Conta para agrupar">
                {pickerTargets.map((t) => (
                  <Button key={t.id} variant="secondary" style={styles.pickerBtn} onClick={() => addExtra(t)}>
                    {`${summaryLabel(t)} · ${formatBRL(t.total)}`}
                  </Button>
                ))}
              </div>
            )
          ) : null}
        </Card>

        {/* Editor de tenders */}
        <Card style={styles.card}>
          <div style={styles.tendersHeader}>
            <h2 style={styles.sectionTitle}>Formas de pagamento</h2>
            <button type="button" onClick={payAllCash} style={styles.shortcut} className="tj-press">
              Pagar tudo em dinheiro
            </button>
          </div>

          <div style={styles.tenderList}>
            {rows.map((row, idx) => (
              <div key={idx} style={styles.tenderRow}>
                <Segmented
                  ariaLabel="Forma de pagamento"
                  columns={2}
                  options={METHOD_OPTIONS}
                  value={row.method}
                  onChange={(m) => setRowMethod(idx, m)}
                />
                <div style={styles.tenderAmountRow}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => setRowAmount(idx, e.target.value)}
                    placeholder="0,00"
                    aria-label="Valor"
                    className="tj-input tj-tnum"
                  />
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      style={styles.removeBtn}
                      className="tj-press"
                      aria-label="Remover forma de pagamento"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={addRow} style={styles.addRow} className="tj-press">
            + Adicionar forma de pagamento
          </button>
        </Card>

        {/* Falta / Troco */}
        <div style={{ ...styles.remainingRow, ...(exactlyPaid ? styles.remainingPaid : null) }}>
          <span style={styles.remainingLabel}>{remNegative ? 'Troco' : 'Falta'}</span>
          <span style={styles.remainingValue} className="tj-tnum">
            {remNegative ? formatBRL(rem.slice(1)) : formatBRL(rem)}
          </span>
        </div>

        {error ? <Alert>{error}</Alert> : null}

        <Button onClick={confirm} busy={submitting} disabled={!exactlyPaid && !submitting} fullWidth>
          {submitting ? 'Registrando…' : 'Confirmar pagamento'}
        </Button>
      </main>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const TAB_LABEL: Record<string, string> = {
  WRISTBAND: 'Pulseira',
  COMANDA: 'Comanda',
  TABLE: 'Mesa',
};

function accountLabel(a: AccountDto): string {
  return `${TAB_LABEL[a.tabType] ?? a.tabType} ${a.number}`;
}

function summaryLabel(a: AccountSummaryDto): string {
  return `${TAB_LABEL[a.tabType] ?? a.tabType} ${a.number}`;
}

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: PaymentMethod.CASH, label: 'Dinheiro' },
  { value: PaymentMethod.PIX, label: 'Pix' },
  { value: PaymentMethod.CREDIT, label: 'Crédito' },
  { value: PaymentMethod.DEBIT, label: 'Débito' },
];

/* ── Estilos (layout; vocabulário interativo vem de shared/ui + base.css) ──── */

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--tj-canvas)',
    color: 'var(--tj-ink)',
  },
  main: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '520px',
    margin: '0 auto',
    padding: 'var(--tj-space-4)',
    display: 'grid',
    gap: 'var(--tj-space-4)',
  },
  card: { display: 'grid', gap: 'var(--tj-space-3)', padding: 'var(--tj-space-4)' },
  accountHeader: { display: 'grid', gap: 'var(--tj-space-2)' },
  accountName: {
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '20px',
    letterSpacing: '-0.3px',
    color: 'var(--tj-ink)',
  },
  discountRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  discountValue: { fontSize: '16px', fontWeight: 500, color: 'var(--tj-muted)' },
  discountAmount: { fontSize: '16px', fontWeight: 500, color: 'var(--tj-danger-text)' },
  totalRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 'var(--tj-space-2)',
    borderTop: '1px solid var(--tj-hairline)',
  },
  totalLabel: { fontSize: '15px', fontWeight: 600, color: 'var(--tj-body)' },
  totalAmount: {
    fontSize: '30px',
    fontWeight: 700,
    color: 'var(--tj-ink)',
    letterSpacing: '-0.3px',
  },
  summaryLabel: { fontSize: '14px', fontWeight: 500, color: 'var(--tj-muted)' },

  tendersHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-3)',
    flexWrap: 'wrap',
  },
  sectionTitle: { margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--tj-body)' },
  shortcut: {
    minHeight: '36px',
    padding: '0 var(--tj-space-3)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--tj-brand-deep)',
    background: 'var(--tj-brand-pale)',
    border: 'none',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
  },
  tenderList: { display: 'grid', gap: 'var(--tj-space-3)' },
  tenderRow: { display: 'grid', gap: 'var(--tj-space-2)' },
  tenderAmountRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 'var(--tj-space-2)',
    alignItems: 'center',
  },
  removeBtn: {
    width: '44px',
    height: '44px',
    fontSize: '22px',
    lineHeight: 1,
    color: 'var(--tj-muted)',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--tj-radius-input)',
    cursor: 'pointer',
  },
  addRow: {
    minHeight: '44px',
    padding: '0 var(--tj-space-3)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--tj-body)',
    background: 'transparent',
    border: '1px dashed var(--tj-hairline-strong)',
    borderRadius: 'var(--tj-radius-input)',
    cursor: 'pointer',
  },

  // Agrupamento (F-5)
  groupRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--tj-space-2)',
    padding: 'var(--tj-space-1) 0',
    borderTop: '1px solid var(--tj-hairline)',
    marginTop: 'var(--tj-space-2)',
  },
  groupLabel: { flex: 1, fontSize: '15px', fontWeight: 500, color: 'var(--tj-body)' },
  groupValue: { fontSize: '15px', fontWeight: 600, color: 'var(--tj-ink)' },
  groupTotalRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 'var(--tj-space-2)',
    marginTop: 'var(--tj-space-2)',
    borderTop: '1px solid var(--tj-hairline-strong)',
    marginBottom: 'var(--tj-space-3)',
  },
  pickerEmpty: { margin: 'var(--tj-space-2) 0 0', fontSize: '14px', color: 'var(--tj-muted)' },
  pickerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
    gap: 'var(--tj-space-2)',
    marginTop: 'var(--tj-space-2)',
  },
  pickerBtn: { minHeight: '44px', padding: '0 var(--tj-space-3)', fontSize: '14px' },

  remainingRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    padding: 'var(--tj-space-3) var(--tj-space-4)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-md)',
    transition: 'background 200ms ease, border-color 200ms ease',
  },
  remainingPaid: { background: 'var(--tj-brand-pale)', borderColor: 'var(--tj-brand)' },
  remainingLabel: { fontSize: '15px', fontWeight: 600, color: 'var(--tj-body)' },
  remainingValue: { fontSize: '24px', fontWeight: 700, color: 'var(--tj-ink)' },

  // Success view
  centeredMain: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '480px',
    margin: '0 auto',
    padding: 'var(--tj-space-5) var(--tj-space-4)',
    display: 'grid',
    placeItems: 'center',
    minHeight: '80vh',
  },
  successCard: { width: '100%', display: 'grid', gap: 'var(--tj-space-3)' },
  displayTitle: {
    margin: 0,
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '28px',
    letterSpacing: '-0.5px',
    color: 'var(--tj-ink)',
  },
  paidTotalRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    padding: 'var(--tj-space-3) 0',
    borderTop: '1px solid var(--tj-hairline)',
    borderBottom: '1px solid var(--tj-hairline)',
  },
  displayAmount: {
    fontSize: '30px',
    fontWeight: 700,
    color: 'var(--tj-ink)',
    letterSpacing: '-0.3px',
  },
  doneActions: { display: 'grid', gap: 'var(--tj-space-2)', marginTop: 'var(--tj-space-2)' },

  // Load states
  stateBox: {
    maxWidth: '520px',
    margin: '0 auto',
    padding: 'var(--tj-space-5) var(--tj-space-4)',
    display: 'grid',
    gap: 'var(--tj-space-3)',
    justifyItems: 'start',
  },
  stateMsg: {
    margin: 0,
    padding: 'var(--tj-space-5) var(--tj-space-4)',
    fontSize: '15px',
    color: 'var(--tj-muted)',
  },
};
