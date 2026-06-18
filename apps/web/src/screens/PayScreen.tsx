import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { AccountDto } from '@teu-jardim/shared';
import { PaymentMethod } from '@teu-jardim/shared';
import { accountsApi } from '../accounts/accounts-api';
import { paymentsApi } from '../payments/payments-api';
import { remaining, isExactlyPaid, toTenderRequest } from '../payments/tenders';
import type { TenderRow } from '../payments/tenders';
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';

/**
 * Tela de pagamento (PRD §12 passo 7, RB-037). Caixa monta formas de pagamento
 * (split em múltiplos métodos) e confirma quando o total bateu exatamente.
 * Atalho "Pagar tudo em dinheiro" define uma única linha CASH = total da conta.
 */
export function PayScreen(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [account, setAccount] = useState<AccountDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<TenderRow[]>([{ method: PaymentMethod.CASH, amount: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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

  function payAllCash(): void {
    if (!account) return;
    setRows([{ method: PaymentMethod.CASH, amount: account.total }]);
  }

  function confirm(): void {
    if (!account || submitting) return;
    setError(null);
    setSubmitting(true);
    paymentsApi
      .pay({ accountIds: [id], tenders: toTenderRequest(rows) })
      .then(() => setDone(true))
      .catch((err) => {
        setError(err instanceof ApiError && (err.status === 400 || err.status === 409)
          ? err.message
          : 'Não foi possível registrar o pagamento. Tente novamente.');
        setSubmitting(false);
      });
  }

  // — Success view
  if (done) {
    return (
      <div style={styles.page}>
        <style>{scopedCss}</style>
        <main style={styles.centeredMain}>
          <section style={styles.card}>
            <span style={styles.badge}>
              <span aria-hidden="true" style={styles.badgeDot} />
              Conta paga
            </span>
            <h1 style={styles.displayTitle}>
              {account ? accountLabel(account) : 'Conta'}
            </h1>
            <div style={styles.paidTotalRow}>
              <span style={styles.summaryLabel}>Total pago</span>
              <span style={styles.displayAmount}>{account ? formatBRL(account.total) : ''}</span>
            </div>
            <div style={styles.doneActions}>
              <button
                type="button"
                onClick={() => navigate('/lancar')}
                style={styles.ghostWide}
                className="tj-press"
              >
                Nova conta
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                style={styles.cta}
                className="tj-press"
              >
                Voltar ao início
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // — Load error
  if (loadError) {
    return (
      <div style={styles.page}>
        <style>{scopedCss}</style>
        <header style={styles.topbar}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={styles.backButton}
            className="tj-press"
            aria-label="Voltar"
          >
            <span aria-hidden="true" style={styles.backArrow}>←</span>
            Voltar
          </button>
        </header>
        <div style={styles.stateBox}>
          <p style={styles.stateMsg}>{loadError}</p>
          <button type="button" onClick={() => navigate(-1)} style={styles.ghost} className="tj-press">
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // — Loading
  if (!account) {
    return (
      <div style={styles.page}>
        <style>{scopedCss}</style>
        <header style={styles.topbar}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={styles.backButton}
            className="tj-press"
            aria-label="Voltar"
          >
            <span aria-hidden="true" style={styles.backArrow}>←</span>
            Voltar
          </button>
        </header>
        <p style={styles.stateMsg} aria-live="polite">Carregando conta…</p>
      </div>
    );
  }

  const rem = remaining(account.total, rows);
  const remNegative = rem.startsWith('-');
  const exactlyPaid = isExactlyPaid(account.total, rows);

  return (
    <div style={styles.page}>
      <style>{scopedCss}</style>

      <header style={styles.topbar}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={styles.backButton}
          className="tj-press"
          aria-label="Voltar"
        >
          <span aria-hidden="true" style={styles.backArrow}>←</span>
          {accountLabel(account)}
        </button>
        <span style={styles.headTitle}>Pagamento</span>
      </header>

      <main style={styles.main}>
        {/* Resumo da conta */}
        <section style={styles.card}>
          <div style={styles.accountHeader}>
            <span style={styles.accountName}>{accountLabel(account)}</span>
            {account.discountTotal !== '0.00' ? (
              <div style={styles.discountRow}>
                <span style={styles.summaryLabel}>Subtotal</span>
                <span style={styles.discountValue}>{formatBRL(account.subtotal)}</span>
              </div>
            ) : null}
            {account.discountTotal !== '0.00' ? (
              <div style={styles.discountRow}>
                <span style={styles.summaryLabel}>Desconto</span>
                <span style={styles.discountAmount}>− {formatBRL(account.discountTotal)}</span>
              </div>
            ) : null}
            <div style={styles.totalRow}>
              <span style={styles.totalLabel}>Total</span>
              <span style={styles.totalAmount}>{formatBRL(account.total)}</span>
            </div>
          </div>
        </section>

        {/* Editor de tenders */}
        <section style={styles.card}>
          <div style={styles.tendersHeader}>
            <h2 style={styles.sectionTitle}>Formas de pagamento</h2>
            <button
              type="button"
              onClick={payAllCash}
              style={styles.shortcut}
              className="tj-press"
            >
              Pagar tudo em dinheiro
            </button>
          </div>

          <div style={styles.tenderList}>
            {rows.map((row, idx) => (
              <div key={idx} style={styles.tenderRow}>
                {/* Segmented method selector */}
                <div style={styles.methodSeg} role="group" aria-label="Forma de pagamento">
                  {METHOD_OPTIONS.map(({ value, label }) => {
                    const on = row.method === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setRowMethod(idx, value)}
                        style={{ ...styles.segBtn, ...(on ? styles.segBtnOn : null) }}
                        className="tj-press"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div style={styles.tenderAmountRow}>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => setRowAmount(idx, e.target.value)}
                    placeholder="0,00"
                    aria-label="Valor"
                    style={styles.input}
                    className="tj-input"
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
        </section>

        {/* Falta / Troco */}
        <div
          style={{
            ...styles.remainingRow,
            ...(exactlyPaid ? styles.remainingPaid : null),
          }}
        >
          <span style={styles.remainingLabel}>{remNegative ? 'Troco' : 'Falta'}</span>
          <span style={styles.remainingValue}>
            {remNegative ? formatBRL(rem.slice(1)) : formatBRL(rem)}
          </span>
        </div>

        {error ? (
          <p role="alert" style={styles.error}>
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={confirm}
          disabled={!exactlyPaid || submitting}
          style={{
            ...styles.cta,
            ...styles.ctaFull,
            ...(!exactlyPaid || submitting ? styles.ctaDisabled : null),
          }}
          className="tj-press"
        >
          {submitting ? 'Registrando…' : 'Confirmar pagamento'}
        </button>
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

const METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: PaymentMethod.CASH, label: 'Dinheiro' },
  { value: PaymentMethod.PIX, label: 'Pix' },
  { value: PaymentMethod.CREDIT, label: 'Crédito' },
  { value: PaymentMethod.DEBIT, label: 'Débito' },
];

/* ── Estilos ─────────────────────────────────────────────────────────────── */

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--tj-cream)',
    fontFamily: 'var(--tj-font-ui)',
    color: 'var(--tj-ink)',
  },
  topbar: {
    position: 'sticky',
    top: 0,
    zIndex: 5,
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
  headTitle: {
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '18px',
    letterSpacing: '-0.2px',
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
  card: {
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius)',
    padding: 'var(--tj-space-4)',
    boxShadow: '0 1px 2px rgba(26, 27, 18, 0.06)',
    display: 'grid',
    gap: 'var(--tj-space-3)',
  },
  accountHeader: { display: 'grid', gap: 'var(--tj-space-2)' },
  accountName: {
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '20px',
    letterSpacing: '-0.2px',
    color: 'var(--tj-ink)',
  },
  discountRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  discountValue: {
    fontSize: '16px',
    fontWeight: 500,
    color: 'var(--tj-muted)',
    fontVariantNumeric: 'tabular-nums',
  },
  discountAmount: {
    fontSize: '16px',
    fontWeight: 500,
    color: 'var(--tj-danger-text)',
    fontVariantNumeric: 'tabular-nums',
  },
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
    fontVariantNumeric: 'tabular-nums',
    fontFamily: 'var(--tj-font-display)',
  },
  summaryLabel: { fontSize: '14px', fontWeight: 500, color: 'var(--tj-muted)' },

  tendersHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-3)',
    flexWrap: 'wrap',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--tj-body)',
  },
  shortcut: {
    minHeight: '36px',
    padding: '0 var(--tj-space-3)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--tj-cta)',
    background: 'var(--tj-pale)',
    border: 'none',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
    transition: 'transform 80ms ease, opacity 120ms ease',
  },
  tenderList: { display: 'grid', gap: 'var(--tj-space-3)' },
  tenderRow: { display: 'grid', gap: 'var(--tj-space-2)' },
  methodSeg: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  segBtn: {
    flex: '1 1 auto',
    minHeight: '40px',
    padding: '0 var(--tj-space-2)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--tj-body)',
    background: 'var(--tj-canvas-soft)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
    transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
  },
  segBtnOn: {
    color: 'var(--tj-cta-contrast)',
    background: 'var(--tj-cta)',
    border: '1px solid var(--tj-cta)',
  },
  tenderAmountRow: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: 'var(--tj-space-2)',
    alignItems: 'center',
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
    minHeight: '40px',
    padding: '0 var(--tj-space-3)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--tj-body)',
    background: 'transparent',
    border: '1px dashed var(--tj-hairline-strong)',
    borderRadius: 'var(--tj-radius-input)',
    cursor: 'pointer',
    transition: 'transform 80ms ease, border-color 120ms ease',
  },

  remainingRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    padding: 'var(--tj-space-3) var(--tj-space-4)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius)',
    transition: 'background 200ms ease, border-color 200ms ease',
  },
  remainingPaid: {
    background: 'var(--tj-pale)',
    borderColor: 'var(--tj-olive)',
  },
  remainingLabel: { fontSize: '15px', fontWeight: 600, color: 'var(--tj-body)' },
  remainingValue: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--tj-ink)',
    fontVariantNumeric: 'tabular-nums',
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
  ctaFull: { width: '100%' },
  ctaDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  ghost: {
    minHeight: '48px',
    padding: '0 var(--tj-space-4)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--tj-body)',
    background: 'transparent',
    border: '1px solid var(--tj-hairline-strong)',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
    transition: 'transform 80ms ease, border-color 120ms ease',
  },
  ghostWide: {
    minHeight: '48px',
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
    transition: 'transform 80ms ease, border-color 120ms ease',
  },

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
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    width: 'fit-content',
    fontSize: '13px',
    fontWeight: 600,
    padding: '4px 12px 4px 10px',
    borderRadius: 'var(--tj-radius-pill)',
    color: 'var(--tj-cta)',
    background: 'var(--tj-pale)',
  },
  badgeDot: { width: '8px', height: '8px', borderRadius: '9999px', background: 'var(--tj-olive)' },
  displayTitle: {
    margin: 0,
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '28px',
    letterSpacing: '-0.3px',
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
    fontVariantNumeric: 'tabular-nums',
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
@media (prefers-reduced-motion: reduce) {
  .tj-input, .tj-press { transition: none; }
  .tj-press:not(:disabled):active { transform: none; }
}
`;
