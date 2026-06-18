import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { AccountDto, ProductDto } from '@teu-jardim/shared';
import type { CartLine } from '../accounts/cart';
import { previewLineTotal, previewCartTotal, toPlaceItems } from '../accounts/cart';
import { useCatalog } from '../catalog/useCatalog';
import { accountsApi } from '../accounts/accounts-api';
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';

/**
 * Tela de pedido (PRD §12 passos 2–6, RB-018). Com a conta escolhida, o garçom
 * seleciona produtos do catálogo, monta o pedido (carrinho com quantidade / peso /
 * observações), confere o resumo e confirma — o servidor recalcula os totais e é a
 * fonte da verdade. Densa, tátil, calma sob pressão; alvos ≥44px no celular.
 */
export function OrderScreen(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { loading, categories, error } = useCatalog();

  const [account, setAccount] = useState<AccountDto | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [draft, setDraft] = useState<ProductDto | null>(null); // produto no painel de adição
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<AccountDto | null>(null);

  useEffect(() => {
    let alive = true;
    if (id) accountsApi.get(id).then((a) => alive && setAccount(a)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id]);

  const activeCategory = useMemo(() => {
    if (categories.length === 0) return null;
    return categories.find((c) => c.id === activeCategoryId) ?? categories[0];
  }, [categories, activeCategoryId]);

  function tapProduct(product: ProductDto): void {
    // UNIT sem observações entra direto; WEIGHED ou UNIT com observações abrem o painel.
    if (product.type === 'UNIT' && !product.usesObservations) {
      addLine({ product, quantity: 1, weightGrams: null, observationIds: [] });
      return;
    }
    setDraft(product);
  }

  function addLine(line: Omit<CartLine, 'key'>): void {
    setLines((prev) => [...prev, { key: crypto.randomUUID(), ...line }]);
  }

  function removeLine(key: string): void {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function confirm(): void {
    if (lines.length === 0 || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    accountsApi
      .placeItems(id, toPlaceItems(lines))
      .then((acc) => setDone(acc))
      .catch((err) => {
        setSubmitError(err instanceof ApiError ? messageFor(err) : OFFLINE);
        setSubmitting(false);
      });
  }

  if (done) {
    return <Confirmation account={done} navigate={navigate} />;
  }

  const cartTotal = previewCartTotal(lines);

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
        <span style={styles.headTitle}>{account ? accountLabel(account) : 'Conta'}</span>
      </header>

      {loading ? (
        <p style={styles.state} aria-live="polite">
          Carregando catálogo…
        </p>
      ) : error ? (
        <div style={styles.state}>
          <p style={styles.stateMsg}>Não foi possível carregar o catálogo.</p>
          <button type="button" onClick={() => navigate('/')} style={styles.ghost} className="tj-press">
            Voltar
          </button>
        </div>
      ) : (
        <div style={styles.layout} className="tj-order-grid">
          {/* Catálogo */}
          <section style={styles.catalog} aria-label="Catálogo">
            <div style={styles.tabs} role="tablist" aria-label="Categorias">
              {categories.map((c) => {
                const on = activeCategory?.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setActiveCategoryId(c.id)}
                    style={{ ...styles.tab, ...(on ? styles.tabOn : null) }}
                    className="tj-press"
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>

            <div style={styles.productGrid}>
              {(activeCategory?.products ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => tapProduct(p)}
                  style={styles.productCard}
                  className="tj-press tj-card"
                >
                  <span style={styles.productName}>{p.name}</span>
                  <span style={styles.productFoot}>
                    <span style={styles.productPrice}>
                      {formatBRL(p.price)}
                      {p.type === 'WEIGHED' ? <span style={styles.unitSuffix}> /kg</span> : null}
                    </span>
                    <span style={styles.chips}>
                      {p.type === 'WEIGHED' ? <span style={styles.chip}>kg</span> : null}
                      {p.usesObservations ? <span style={styles.chip}>obs</span> : null}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Carrinho */}
          <section style={styles.cart} aria-label="Pedido">
            <h2 style={styles.cartTitle}>Pedido</h2>

            {lines.length === 0 ? (
              <p style={styles.cartEmpty}>Toque num produto para começar.</p>
            ) : (
              <ul style={styles.lineList}>
                {lines.map((l) => (
                  <li key={l.key} style={styles.line}>
                    <div style={styles.lineMain}>
                      <span style={styles.lineName}>{l.product.name}</span>
                      <span style={styles.lineDetail}>{lineDetail(l)}</span>
                      {l.observationIds.length > 0 ? (
                        <span style={styles.lineObs}>{obsNames(l).join(' · ')}</span>
                      ) : null}
                    </div>
                    <span style={styles.linePrice}>{formatBRL(previewLineTotal(l))}</span>
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      style={styles.removeButton}
                      className="tj-press"
                      aria-label={`Remover ${l.product.name}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div style={styles.summary}>
              <div style={styles.summaryRow}>
                <span style={styles.summaryLabel}>Total</span>
                <span style={styles.summaryValue}>{formatBRL(cartTotal)}</span>
              </div>
              <p style={styles.summaryNote}>Prévia. O servidor confirma o valor final.</p>
            </div>

            {submitError ? (
              <p role="alert" style={styles.error}>
                {submitError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={confirm}
              disabled={lines.length === 0 || submitting}
              style={{
                ...styles.cta,
                ...(lines.length === 0 || submitting ? styles.ctaDisabled : null),
              }}
              className="tj-press"
            >
              {submitting ? 'Lançando…' : 'Confirmar pedido'}
            </button>
          </section>
        </div>
      )}

      {draft ? (
        <AddPanel
          product={draft}
          onCancel={() => setDraft(null)}
          onAdd={(line) => {
            addLine(line);
            setDraft(null);
          }}
        />
      ) : null}
    </div>
  );
}

/* ── Painel de adição (peso / observações + quantidade) ───────────────────── */

function AddPanel({
  product,
  onCancel,
  onAdd,
}: {
  product: ProductDto;
  onCancel: () => void;
  onAdd: (line: Omit<CartLine, 'key'>) => void;
}): React.JSX.Element {
  const isWeighed = product.type === 'WEIGHED';
  const [quantity, setQuantity] = useState(1);
  const [grams, setGrams] = useState('');
  const [obs, setObs] = useState<string[]>([]);

  const gramsNum = Number(grams);
  const gramsValid = Number.isInteger(gramsNum) && gramsNum >= 1;
  const canAdd = isWeighed ? gramsValid : quantity >= 1;

  const preview = previewLineTotal({
    key: 'preview',
    product,
    quantity,
    weightGrams: isWeighed ? (gramsValid ? gramsNum : 0) : null,
    observationIds: obs,
  });

  function toggleObs(obsId: string): void {
    setObs((prev) => (prev.includes(obsId) ? prev.filter((x) => x !== obsId) : [...prev, obsId]));
  }

  function submit(): void {
    if (!canAdd) return;
    onAdd(
      isWeighed
        ? { product, quantity: 1, weightGrams: gramsNum, observationIds: [] }
        : { product, quantity, weightGrams: null, observationIds: obs },
    );
  }

  return (
    <div style={styles.backdrop} onClick={onCancel} role="presentation">
      <div
        style={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`Adicionar ${product.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.sheetHead}>
          <h2 style={styles.sheetTitle}>{product.name}</h2>
          <span style={styles.sheetPrice}>
            {formatBRL(product.price)}
            {isWeighed ? <span style={styles.unitSuffix}> /kg</span> : null}
          </span>
        </div>

        {isWeighed ? (
          <div style={styles.field}>
            <label htmlFor="tj-grams" style={styles.label}>
              Peso (gramas)
            </label>
            <input
              id="tj-grams"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={grams}
              onChange={(e) => setGrams(e.target.value.replace(/\D/g, ''))}
              autoFocus
              placeholder="Ex.: 453"
              maxLength={6}
              style={styles.input}
              className="tj-input"
            />
          </div>
        ) : (
          <>
            {product.observations.length > 0 ? (
              <div style={styles.field}>
                <span style={styles.label}>Observações</span>
                <div style={styles.obsWrap}>
                  {product.observations.map((o) => {
                    const on = obs.includes(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleObs(o.id)}
                        style={{ ...styles.obsChip, ...(on ? styles.obsChipOn : null) }}
                        className="tj-press"
                      >
                        {o.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div style={styles.field}>
              <span style={styles.label}>Quantidade</span>
              <div style={styles.stepper}>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  style={styles.stepBtn}
                  className="tj-press"
                  aria-label="Diminuir"
                >
                  −
                </button>
                <span style={styles.stepValue} aria-live="polite">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => q + 1)}
                  style={styles.stepBtn}
                  className="tj-press"
                  aria-label="Aumentar"
                >
                  +
                </button>
              </div>
            </div>
          </>
        )}

        <div style={styles.sheetPreview}>
          <span style={styles.summaryLabel}>Subtotal</span>
          <span style={styles.summaryValue}>{formatBRL(preview)}</span>
        </div>

        <div style={styles.sheetActions}>
          <button type="button" onClick={onCancel} style={styles.ghost} className="tj-press">
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canAdd}
            style={{ ...styles.cta, ...(canAdd ? null : styles.ctaDisabled) }}
            className="tj-press"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Confirmação ─────────────────────────────────────────────────────────── */

function Confirmation({
  account,
  navigate,
}: {
  account: AccountDto;
  navigate: (to: string) => void;
}): React.JSX.Element {
  return (
    <div style={styles.page}>
      <style>{scopedCss}</style>
      <main style={styles.confirmMain}>
        <section style={styles.confirmCard}>
          <span style={styles.confirmBadge}>
            <span aria-hidden="true" style={styles.confirmDot} />
            Pedido lançado
          </span>
          <h1 style={styles.confirmTitle}>{accountLabel(account)}</h1>
          <p style={styles.confirmCount}>
            {account.items.length === 1 ? '1 item' : `${account.items.length} itens`} na conta
          </p>
          <div style={styles.confirmTotalRow}>
            <span style={styles.summaryLabel}>Total da conta</span>
            <span style={styles.confirmTotal}>{formatBRL(account.total)}</span>
          </div>
          <div style={styles.confirmActions}>
            <button
              type="button"
              onClick={() => navigate('/lancar')}
              style={styles.ghostWide}
              className="tj-press"
            >
              Lançar em outra conta
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

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const TAB_LABEL: Record<string, string> = {
  WRISTBAND: 'Pulseira',
  COMANDA: 'Comanda',
  TABLE: 'Mesa',
};

const OFFLINE = 'Sem conexão com o servidor. Verifique a rede e tente de novo.';

function accountLabel(a: AccountDto): string {
  return `${TAB_LABEL[a.tabType] ?? a.tabType} ${a.number}`;
}

function messageFor(err: ApiError): string {
  if (err.status === 409 || err.status === 400) return err.message; // negócio em PT
  return 'Não foi possível lançar o pedido. Tente novamente.';
}

function lineDetail(l: CartLine): string {
  if (l.product.type === 'WEIGHED') return `${l.weightGrams ?? 0} g`;
  return `× ${l.quantity}`;
}

function obsNames(l: CartLine): string[] {
  return l.observationIds
    .map((oid) => l.product.observations.find((o) => o.id === oid)?.name)
    .filter((n): n is string => Boolean(n));
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

  state: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: 'var(--tj-space-5) var(--tj-space-4)',
    display: 'grid',
    gap: 'var(--tj-space-3)',
    justifyItems: 'start',
    fontSize: '15px',
    color: 'var(--tj-muted)',
  },
  stateMsg: { margin: 0, fontSize: '16px', color: 'var(--tj-body)' },

  layout: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '1040px',
    margin: '0 auto',
    padding: 'var(--tj-space-4)',
    display: 'grid',
    gap: 'var(--tj-space-4)',
    alignItems: 'start',
  },

  catalog: { display: 'grid', gap: 'var(--tj-space-3)', minWidth: 0 },
  tabs: {
    display: 'flex',
    gap: '6px',
    overflowX: 'auto',
    paddingBottom: '2px',
  },
  tab: {
    flex: '0 0 auto',
    minHeight: '44px',
    padding: '0 var(--tj-space-3)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--tj-muted)',
    background: 'transparent',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
    transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
  },
  tabOn: {
    color: 'var(--tj-cta-contrast)',
    background: 'var(--tj-cta)',
    border: '1px solid var(--tj-cta)',
  },
  productGrid: {
    display: 'grid',
    gap: 'var(--tj-space-3)',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  },
  productCard: {
    display: 'grid',
    gap: 'var(--tj-space-3)',
    justifyItems: 'start',
    textAlign: 'left',
    minHeight: '96px',
    padding: 'var(--tj-space-3)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius)',
    cursor: 'pointer',
    transition: 'transform 80ms ease, border-color 120ms ease, box-shadow 120ms ease',
  },
  productName: {
    fontSize: '16px',
    fontWeight: 600,
    lineHeight: 1.25,
    color: 'var(--tj-ink)',
  },
  productFoot: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-2)',
    width: '100%',
    marginTop: 'auto',
  },
  productPrice: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--tj-body)',
    fontVariantNumeric: 'tabular-nums',
  },
  unitSuffix: { fontSize: '12px', fontWeight: 600, color: 'var(--tj-faint)' },
  chips: { display: 'inline-flex', gap: '4px' },
  chip: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '2px 7px',
    borderRadius: 'var(--tj-radius-input)',
    color: 'var(--tj-cta)',
    background: 'var(--tj-pale)',
  },

  cart: {
    display: 'grid',
    gap: 'var(--tj-space-3)',
    alignContent: 'start',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius)',
    padding: 'var(--tj-space-4)',
    boxShadow: '0 1px 2px rgba(26, 27, 18, 0.06)',
  },
  cartTitle: {
    margin: 0,
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '20px',
    color: 'var(--tj-ink)',
  },
  cartEmpty: { margin: 0, fontSize: '14px', color: 'var(--tj-faint)', lineHeight: 1.5 },
  lineList: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--tj-space-2)' },
  line: {
    display: 'grid',
    gridTemplateColumns: '1fr auto auto',
    alignItems: 'center',
    gap: 'var(--tj-space-2)',
    padding: 'var(--tj-space-2) 0',
    borderBottom: '1px solid var(--tj-hairline)',
  },
  lineMain: { display: 'grid', gap: '1px', minWidth: 0 },
  lineName: { fontSize: '15px', fontWeight: 600, color: 'var(--tj-ink)' },
  lineDetail: { fontSize: '13px', color: 'var(--tj-muted)', fontVariantNumeric: 'tabular-nums' },
  lineObs: { fontSize: '12px', color: 'var(--tj-faint)' },
  linePrice: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--tj-body)',
    fontVariantNumeric: 'tabular-nums',
  },
  removeButton: {
    minWidth: '32px',
    minHeight: '32px',
    fontSize: '20px',
    lineHeight: 1,
    color: 'var(--tj-muted)',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--tj-radius-input)',
    cursor: 'pointer',
  },
  summary: { display: 'grid', gap: '2px', marginTop: 'var(--tj-space-1)' },
  summaryRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  summaryLabel: { fontSize: '14px', fontWeight: 500, color: 'var(--tj-muted)' },
  summaryValue: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--tj-ink)',
    fontVariantNumeric: 'tabular-nums',
  },
  summaryNote: { margin: 0, fontSize: '12px', color: 'var(--tj-faint)' },

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

  // Painel de adição (bottom sheet)
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 20,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    background: 'rgba(26, 27, 18, 0.32)',
  },
  sheet: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '460px',
    display: 'grid',
    gap: 'var(--tj-space-4)',
    background: 'var(--tj-surface)',
    borderTopLeftRadius: 'var(--tj-radius)',
    borderTopRightRadius: 'var(--tj-radius)',
    border: '1px solid var(--tj-hairline)',
    padding: 'var(--tj-space-4)',
    boxShadow: '0 -8px 32px rgba(26, 27, 18, 0.18)',
  },
  sheetHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-3)',
  },
  sheetTitle: {
    margin: 0,
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '22px',
    color: 'var(--tj-ink)',
  },
  sheetPrice: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--tj-body)',
    fontVariantNumeric: 'tabular-nums',
  },
  field: { display: 'grid', gap: 'var(--tj-space-2)' },
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
    fontVariantNumeric: 'tabular-nums',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
  },
  obsWrap: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  obsChip: {
    minHeight: '44px',
    padding: '0 var(--tj-space-3)',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--tj-body)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline-strong)',
    borderRadius: 'var(--tj-radius-pill)',
    cursor: 'pointer',
    transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
  },
  obsChipOn: {
    color: 'var(--tj-cta)',
    background: 'var(--tj-pale)',
    border: '1px solid var(--tj-olive)',
  },
  stepper: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--tj-space-3)',
    padding: '4px',
    background: 'var(--tj-canvas-soft)',
    borderRadius: 'var(--tj-radius-pill)',
    width: 'fit-content',
  },
  stepBtn: {
    width: '44px',
    height: '44px',
    fontSize: '22px',
    lineHeight: 1,
    fontWeight: 600,
    color: 'var(--tj-cta)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: '9999px',
    cursor: 'pointer',
  },
  stepValue: {
    minWidth: '32px',
    textAlign: 'center',
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--tj-ink)',
    fontVariantNumeric: 'tabular-nums',
  },
  sheetPreview: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 'var(--tj-space-3)',
    borderTop: '1px solid var(--tj-hairline)',
  },
  sheetActions: { display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 'var(--tj-space-3)' },

  // Confirmação
  confirmMain: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '480px',
    margin: '0 auto',
    padding: 'var(--tj-space-5) var(--tj-space-4)',
    display: 'grid',
    placeItems: 'center',
    minHeight: '80vh',
  },
  confirmCard: {
    width: '100%',
    boxSizing: 'border-box',
    display: 'grid',
    gap: 'var(--tj-space-3)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius)',
    padding: 'var(--tj-space-5)',
    boxShadow: '0 1px 2px rgba(26, 27, 18, 0.06)',
  },
  confirmBadge: {
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
  confirmDot: { width: '8px', height: '8px', borderRadius: '9999px', background: 'var(--tj-olive)' },
  confirmTitle: {
    margin: 0,
    fontFamily: 'var(--tj-font-display)',
    fontWeight: 600,
    fontSize: '28px',
    letterSpacing: '-0.3px',
    color: 'var(--tj-ink)',
  },
  confirmCount: { margin: 0, fontSize: '14px', color: 'var(--tj-muted)' },
  confirmTotalRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    padding: 'var(--tj-space-3) 0',
    borderTop: '1px solid var(--tj-hairline)',
    borderBottom: '1px solid var(--tj-hairline)',
  },
  confirmTotal: {
    fontSize: '30px',
    fontWeight: 700,
    color: 'var(--tj-ink)',
    fontVariantNumeric: 'tabular-nums',
  },
  confirmActions: { display: 'grid', gap: 'var(--tj-space-2)', marginTop: 'var(--tj-space-2)' },
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
.tj-card:not(:disabled):hover {
  border-color: var(--tj-hairline-strong);
  box-shadow: 0 2px 8px rgba(26, 27, 18, 0.08);
}
@media (min-width: 760px) {
  .tj-order-grid { grid-template-columns: 1fr 360px; }
}
@media (prefers-reduced-motion: reduce) {
  .tj-input, .tj-press, .tj-card { transition: none; }
  .tj-press:not(:disabled):active { transform: none; }
}
`;
