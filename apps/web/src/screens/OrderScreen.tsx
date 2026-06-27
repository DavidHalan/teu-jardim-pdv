import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { AccountDto, ProductDto } from '@teu-jardim/shared';
import { Role, DiscountType } from '@teu-jardim/shared';
import type { CartLine } from '../accounts/cart';
import { previewLineTotal, previewCartTotal, toPlaceItems } from '../accounts/cart';
import { useCatalog } from '../catalog/useCatalog';
import { accountsApi } from '../accounts/accounts-api';
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, ScreenHeader, Segmented, StatusPill, TextField } from '../shared/ui';

/**
 * Tela de pedido (PRD §12 passos 2–6, RB-018). Com a conta escolhida, o garçom
 * seleciona produtos do catálogo, monta o pedido (carrinho com quantidade / peso /
 * observações), confere o resumo e confirma — o servidor recalcula os totais e é a
 * fonte da verdade. Densa, tátil, calma sob pressão; alvos ≥44px no celular.
 */
export function OrderScreen(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { loading, categories, error } = useCatalog();

  const [account, setAccount] = useState<AccountDto | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [draft, setDraft] = useState<ProductDto | null>(null); // produto no painel de adição
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<AccountDto | null>(null);

  // Cashier actions state
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>(DiscountType.PERCENT);
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [discountSubmitting, setDiscountSubmitting] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isCashier = user?.role === Role.CASHIER || user?.role === Role.ADMIN;

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

  function applyDiscount(): void {
    if (!discountValue.trim() || discountSubmitting) return;
    setDiscountError(null);
    setDiscountSubmitting(true);
    accountsApi
      .applyDiscount(id, {
        type: discountType,
        value: normalizeAmount(discountValue),
        reason: discountReason.trim() || undefined,
      })
      .then((updated) => {
        setAccount(updated);
        setShowDiscount(false);
        setDiscountValue('');
        setDiscountReason('');
      })
      .catch((err) => {
        setDiscountError(
          err instanceof ApiError && (err.status === 400 || err.status === 409)
            ? err.message
            : 'Não foi possível aplicar o desconto.',
        );
      })
      .finally(() => setDiscountSubmitting(false));
  }

  function cancelAccount(): void {
    if (!cancelReason.trim() || cancelSubmitting) return;
    setCancelError(null);
    setCancelSubmitting(true);
    accountsApi
      .cancel(id, { reason: cancelReason.trim() })
      .then(() => navigate('/'))
      .catch((err) => {
        setCancelError(
          err instanceof ApiError && (err.status === 400 || err.status === 409)
            ? err.message
            : 'Não foi possível cancelar a conta.',
        );
        setCancelSubmitting(false);
      });
  }

  if (done) {
    return <Confirmation account={done} navigate={navigate} />;
  }

  const cartTotal = previewCartTotal(lines);

  return (
    <div style={styles.page}>
      <style>{scopedCss}</style>
      <ScreenHeader
        onBack={() => navigate('/')}
        backLabel="Início"
        title={account ? accountLabel(account) : 'Conta'}
        sticky
      />

      {/* Ações de caixa — visível apenas para CASHIER / ADMIN (RB-026..031) */}
      {isCashier && account ? (
        <div style={styles.cashierBlock}>
          <div style={styles.cashierTotals}>
            <div style={styles.cashierTotalRow}>
              <span style={styles.cashierLabel}>Subtotal</span>
              <span style={styles.cashierValue} className="tj-tnum">
                {formatBRL(account.subtotal)}
              </span>
            </div>
            {account.discountTotal !== '0.00' ? (
              <div style={styles.cashierTotalRow}>
                <span style={styles.cashierLabel}>Desconto</span>
                <span style={{ ...styles.cashierValue, color: 'var(--tj-danger-text)' }} className="tj-tnum">
                  − {formatBRL(account.discountTotal)}
                </span>
              </div>
            ) : null}
            <div style={{ ...styles.cashierTotalRow, ...styles.cashierTotalStrong }}>
              <span style={styles.cashierTotalLabel}>Total</span>
              <span style={styles.cashierTotalAmount} className="tj-tnum">
                {formatBRL(account.total)}
              </span>
            </div>
          </div>

          {showDiscount ? (
            <div style={styles.cashierForm}>
              <div style={styles.cashierFormTitle}>Aplicar desconto</div>
              <Segmented
                ariaLabel="Tipo de desconto"
                columns={2}
                options={[
                  { value: DiscountType.PERCENT, label: '%' },
                  { value: DiscountType.FIXED, label: 'R$' },
                ]}
                value={discountType}
                onChange={setDiscountType}
              />
              <TextField
                label={discountType === DiscountType.PERCENT ? 'Percentual (%)' : 'Valor (R$)'}
                id="tj-disc-value"
                type="text"
                inputMode="decimal"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === DiscountType.PERCENT ? 'Ex.: 10' : 'Ex.: 5.00'}
              />
              <TextField
                label="Motivo (opcional)"
                id="tj-disc-reason"
                type="text"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                placeholder="Ex.: Cortesia gerência"
              />
              {discountError ? <Alert>{discountError}</Alert> : null}
              <div style={styles.formActions}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowDiscount(false);
                    setDiscountValue('');
                    setDiscountReason('');
                    setDiscountError(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={applyDiscount}
                  busy={discountSubmitting}
                  disabled={!discountValue.trim() && !discountSubmitting}
                >
                  {discountSubmitting ? 'Aplicando…' : 'Aplicar'}
                </Button>
              </div>
            </div>
          ) : null}

          {showCancel ? (
            <div style={{ ...styles.cashierForm, ...styles.cashierFormDanger }}>
              <div style={styles.cashierFormTitle}>Cancelar conta</div>
              <TextField
                label="Motivo (obrigatório)"
                id="tj-cancel-reason"
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex.: Desistência do cliente"
                autoFocus
              />
              {cancelError ? <Alert>{cancelError}</Alert> : null}
              <div style={styles.formActions}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCancel(false);
                    setCancelReason('');
                    setCancelError(null);
                  }}
                >
                  Não cancelar
                </Button>
                <Button
                  variant="danger"
                  onClick={cancelAccount}
                  busy={cancelSubmitting}
                  disabled={!cancelReason.trim() && !cancelSubmitting}
                >
                  {cancelSubmitting ? 'Cancelando…' : 'Confirmar cancelamento'}
                </Button>
              </div>
            </div>
          ) : null}

          {!showDiscount && !showCancel ? (
            <div style={styles.cashierActions}>
              <Button variant="secondary" onClick={() => setShowDiscount(true)}>
                Aplicar desconto
              </Button>
              <Button variant="danger-ghost" onClick={() => setShowCancel(true)}>
                Cancelar conta
              </Button>
              <Button onClick={() => navigate(`/conta/${id}/pagar`)}>Pagar</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p style={styles.state} aria-live="polite">
          Carregando catálogo…
        </p>
      ) : error ? (
        <div style={styles.state}>
          <p style={styles.stateMsg}>Não foi possível carregar o catálogo.</p>
          <Button variant="secondary" onClick={() => navigate('/')}>
            Voltar
          </Button>
        </div>
      ) : (
        <div style={styles.layout} className="tj-order-grid">
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
                    <span style={styles.productPrice} className="tj-tnum">
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
                      <span style={styles.lineDetail} className="tj-tnum">
                        {lineDetail(l)}
                      </span>
                      {l.observationIds.length > 0 ? (
                        <span style={styles.lineObs}>{obsNames(l).join(' · ')}</span>
                      ) : null}
                    </div>
                    <span style={styles.linePrice} className="tj-tnum">
                      {formatBRL(previewLineTotal(l))}
                    </span>
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
                <span style={styles.summaryValue} className="tj-tnum">
                  {formatBRL(cartTotal)}
                </span>
              </div>
              <p style={styles.summaryNote}>Prévia. O servidor confirma o valor final.</p>
            </div>

            {submitError ? <Alert>{submitError}</Alert> : null}

            <Button
              onClick={confirm}
              busy={submitting}
              disabled={lines.length === 0 && !submitting}
              fullWidth
            >
              {submitting ? 'Lançando…' : 'Confirmar pedido'}
            </Button>
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

  // A11y do bottom-sheet (modal): trava o foco, fecha no Esc, devolve o foco ao sair.
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = sheetRef.current;
    const focusables = (): HTMLElement[] =>
      el
        ? Array.from(
            el.querySelectorAll<HTMLElement>(
              'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
            ),
          ).filter((f) => !f.hasAttribute('disabled'))
        : [];
    focusables()[0]?.focus();
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const f = focusables();
      const first = f[0];
      const last = f[f.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

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
        ref={sheetRef}
        style={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={`Adicionar ${product.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.sheetHead}>
          <h2 style={styles.sheetTitle}>{product.name}</h2>
          <span style={styles.sheetPrice} className="tj-tnum">
            {formatBRL(product.price)}
            {isWeighed ? <span style={styles.unitSuffix}> /kg</span> : null}
          </span>
        </div>

        {isWeighed ? (
          <TextField
            label="Peso (gramas)"
            id="tj-grams"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={grams}
            onChange={(e) => setGrams(e.target.value.replace(/\D/g, ''))}
            placeholder="Ex.: 453"
            maxLength={6}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          />
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
                <span style={styles.stepValue} className="tj-tnum" aria-live="polite">
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
          <span style={styles.summaryValue} className="tj-tnum">
            {formatBRL(preview)}
          </span>
        </div>

        <div style={styles.sheetActions}>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canAdd}>
            Adicionar
          </Button>
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
      <main style={styles.confirmMain}>
        <section style={styles.confirmCard}>
          <StatusPill label="Pedido lançado" tone="ready" />
          <h1 style={styles.confirmTitle}>{accountLabel(account)}</h1>
          <p style={styles.confirmCount}>
            {account.items.length === 1 ? '1 item' : `${account.items.length} itens`} na conta
          </p>
          <div style={styles.confirmTotalRow}>
            <span style={styles.summaryLabel}>Total da conta</span>
            <span style={styles.confirmTotal} className="tj-tnum">
              {formatBRL(account.total)}
            </span>
          </div>
          <div style={styles.confirmActions}>
            <Button variant="secondary" fullWidth onClick={() => navigate('/lancar')}>
              Lançar em outra conta
            </Button>
            <Button fullWidth onClick={() => navigate('/')}>
              Voltar ao início
            </Button>
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

/** "5,00" (pt-BR) ou "5.00" → string decimal canônica com ponto (RB-047). */
function normalizeAmount(raw: string): string {
  const t = raw.trim();
  if (t.includes(',')) return t.replace(/\./g, '').replace(',', '.');
  return t;
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

/* ── Estilos (layout; vocabulário interativo vem de shared/ui + base.css) ──── */

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--tj-canvas)',
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
  tabs: { display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' },
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
    background: 'var(--tj-brand-deep)',
    border: '1px solid var(--tj-brand-deep)',
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
    borderRadius: 'var(--tj-radius-md)',
    cursor: 'pointer',
  },
  productName: { fontSize: '16px', fontWeight: 600, lineHeight: 1.25, color: 'var(--tj-ink)' },
  productFoot: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-2)',
    width: '100%',
    marginTop: 'auto',
  },
  productPrice: { fontSize: '15px', fontWeight: 700, color: 'var(--tj-body)' },
  unitSuffix: { fontSize: '12px', fontWeight: 600, color: 'var(--tj-faint)' },
  chips: { display: 'inline-flex', gap: '4px' },
  chip: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '2px 7px',
    borderRadius: 'var(--tj-radius-input)',
    color: 'var(--tj-brand-deep)',
    background: 'var(--tj-brand-pale)',
  },

  cart: {
    display: 'grid',
    gap: 'var(--tj-space-3)',
    alignContent: 'start',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-md)',
    padding: 'var(--tj-space-4)',
    boxShadow: 'var(--tj-shadow-card)',
  },
  cartTitle: {
    margin: 0,
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '20px',
    letterSpacing: '-0.3px',
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
  lineDetail: { fontSize: '13px', color: 'var(--tj-muted)' },
  lineObs: { fontSize: '12px', color: 'var(--tj-faint)' },
  linePrice: { fontSize: '15px', fontWeight: 700, color: 'var(--tj-body)' },
  removeButton: {
    width: '44px',
    height: '44px',
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
  summaryValue: { fontSize: '22px', fontWeight: 700, color: 'var(--tj-ink)' },
  summaryNote: { margin: 0, fontSize: '12px', color: 'var(--tj-faint)' },

  // Painel de adição (bottom sheet)
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 20,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    background: 'oklch(0.218 0.0169 113 / 0.32)',
  },
  sheet: {
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: '460px',
    display: 'grid',
    gap: 'var(--tj-space-4)',
    background: 'var(--tj-surface)',
    borderTopLeftRadius: 'var(--tj-radius-md)',
    borderTopRightRadius: 'var(--tj-radius-md)',
    border: '1px solid var(--tj-hairline)',
    padding: 'var(--tj-space-4)',
    boxShadow: 'var(--tj-shadow-pop)',
  },
  sheetHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-3)',
  },
  sheetTitle: {
    margin: 0,
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '22px',
    letterSpacing: '-0.3px',
    color: 'var(--tj-ink)',
  },
  sheetPrice: { fontSize: '15px', fontWeight: 700, color: 'var(--tj-body)' },
  field: { display: 'grid', gap: 'var(--tj-space-2)' },
  label: { fontSize: 'var(--tj-fs-body-sm)', fontWeight: 500, color: 'var(--tj-body)' },
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
  },
  obsChipOn: {
    color: 'var(--tj-brand-deep)',
    background: 'var(--tj-brand-pale)',
    border: '1px solid var(--tj-brand)',
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
    color: 'var(--tj-brand-deep)',
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
  },
  sheetPreview: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 'var(--tj-space-3)',
    borderTop: '1px solid var(--tj-hairline)',
  },
  sheetActions: { display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 'var(--tj-space-3)' },

  // Cashier block
  cashierBlock: {
    maxWidth: '1040px',
    margin: '0 auto',
    padding: 'var(--tj-space-3) var(--tj-space-4) 0',
    display: 'grid',
    gap: 'var(--tj-space-3)',
  },
  cashierTotals: {
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-md)',
    padding: 'var(--tj-space-3) var(--tj-space-4)',
    display: 'grid',
    gap: '6px',
    boxShadow: 'var(--tj-shadow-card)',
  },
  cashierTotalRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  cashierTotalStrong: {
    borderTop: '1px solid var(--tj-hairline)',
    paddingTop: '8px',
    marginTop: '4px',
  },
  cashierLabel: { fontSize: '13px', fontWeight: 500, color: 'var(--tj-muted)' },
  cashierValue: { fontSize: '15px', fontWeight: 600, color: 'var(--tj-ink)' },
  cashierTotalLabel: { fontSize: '15px', fontWeight: 600, color: 'var(--tj-body)' },
  cashierTotalAmount: {
    fontSize: '24px',
    fontWeight: 700,
    color: 'var(--tj-ink)',
    letterSpacing: '-0.3px',
  },
  cashierForm: {
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-md)',
    padding: 'var(--tj-space-4)',
    display: 'grid',
    gap: 'var(--tj-space-3)',
    boxShadow: 'var(--tj-shadow-card)',
  },
  cashierFormDanger: { borderColor: 'var(--tj-danger-text)' },
  cashierFormTitle: { fontSize: '15px', fontWeight: 600, color: 'var(--tj-body)' },
  formActions: { display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 'var(--tj-space-3)' },
  cashierActions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 'var(--tj-space-2)',
  },

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
    borderRadius: 'var(--tj-radius-md)',
    padding: 'var(--tj-space-5)',
    boxShadow: 'var(--tj-shadow-card)',
  },
  confirmTitle: {
    margin: 0,
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '28px',
    letterSpacing: '-0.5px',
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
  confirmTotal: { fontSize: '30px', fontWeight: 700, color: 'var(--tj-ink)', letterSpacing: '-0.3px' },
  confirmActions: { display: 'grid', gap: 'var(--tj-space-2)', marginTop: 'var(--tj-space-2)' },
};

const scopedCss = `
@media (min-width: 760px) {
  .tj-order-grid { grid-template-columns: 1fr 360px; }
}
`;
