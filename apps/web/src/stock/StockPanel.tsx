import { useEffect, useId, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { StockMovementType } from '@teu-jardim/shared';
import type { StockBalanceRow } from '@teu-jardim/shared';
import { stockApi } from './stock-api';
import { ApiError } from '../lib/api';
import { Alert, Button, Card, Segmented, TextField } from '../shared/ui';

const TYPE_LABEL: Record<StockMovementType, string> = {
  [StockMovementType.IN]: 'Entrada',
  [StockMovementType.OUT]: 'Saída',
  [StockMovementType.ADJUST]: 'Ajuste',
};

/**
 * Estoque simples (RB-045/046/054) — Admin. Saldo derivado da soma dos movimentos;
 * sem baixa por venda. Ajuste é assinado (±) e exige motivo. Confirm-then-display.
 */
export function StockPanel(): React.JSX.Element {
  const id = useId();
  const [rows, setRows] = useState<StockBalanceRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [type, setType] = useState<StockMovementType>(StockMovementType.IN);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      const res = await stockApi.balances();
      setRows(res.rows);
      setListError(null);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Não foi possível carregar o estoque.');
    }
  }

  useEffect(() => {
    let alive = true;
    stockApi
      .balances()
      .then((res) => {
        if (alive) {
          setRows(res.rows);
          setListError(null);
        }
      })
      .catch((err) => {
        if (alive) setListError(err instanceof ApiError ? err.message : 'Não foi possível carregar o estoque.');
      });
    return () => {
      alive = false;
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submitting || !productId) return;
    setError(null);
    setSaved(null);
    setSubmitting(true);
    stockApi
      .move({
        productId,
        type,
        quantity: quantity.trim().replace(',', '.'),
        reason: reason.trim() || undefined,
      })
      .then(async (m) => {
        const product = rows?.find((r) => r.productId === m.productId);
        setSaved(`${TYPE_LABEL[m.type]} registrada: ${m.quantity} × ${product?.productName ?? 'produto'}.`);
        setQuantity('');
        setReason('');
        await load(); // saldo vem do servidor (confirm-then-display)
      })
      .catch((err) => {
        setError(
          err instanceof ApiError && (err.status === 400 || err.status === 404)
            ? err.message
            : 'Não foi possível registrar o movimento.',
        );
      })
      .finally(() => setSubmitting(false));
  }

  const needsReason = type === StockMovementType.ADJUST;

  return (
    <Card style={styles.card} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} style={styles.title}>
        Estoque
      </h2>
      <p style={styles.help}>
        Saldo é a soma dos movimentos — a venda não baixa estoque neste MVP. Ajuste aceita
        valor negativo e exige motivo.
      </p>

      <form style={styles.form} onSubmit={submit} noValidate>
        <Segmented
          ariaLabel="Tipo de movimento"
          options={Object.values(StockMovementType).map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
          value={type}
          onChange={(t) => {
            setType(t);
            setSaved(null);
          }}
        />
        <label style={styles.filterLabel} htmlFor={`${id}-product`}>
          Produto
          <select
            id={`${id}-product`}
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            style={styles.select}
            className="tj-input"
            disabled={submitting}
          >
            <option value="">Selecione…</option>
            {(rows ?? []).map((r) => (
              <option key={r.productId} value={r.productId}>
                {r.productName}
              </option>
            ))}
          </select>
        </label>
        <div style={styles.fields}>
          <TextField
            label={needsReason ? 'Quantidade (±)' : 'Quantidade'}
            id={`${id}-qty`}
            type="text"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder={needsReason ? 'Ex.: -1,5' : 'Ex.: 10'}
            disabled={submitting}
          />
          <TextField
            label={needsReason ? 'Motivo (obrigatório)' : 'Motivo (opcional)'}
            id={`${id}-reason`}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: quebra na contagem"
            maxLength={200}
            disabled={submitting}
          />
        </div>
        {error ? <Alert>{error}</Alert> : null}
        {saved ? (
          <p style={styles.saved} role="status">
            {saved}
          </p>
        ) : null}
        <Button
          type="submit"
          busy={submitting}
          disabled={(!productId || quantity.trim() === '' || (needsReason && reason.trim() === '')) && !submitting}
          fullWidth
        >
          {submitting ? 'Registrando…' : 'Registrar movimento'}
        </Button>
      </form>

      <h3 style={styles.listTitle}>Saldos</h3>
      {listError ? (
        <Alert>{listError}</Alert>
      ) : rows === null ? (
        <p style={styles.help} aria-live="polite">
          Carregando estoque…
        </p>
      ) : (
        <ul style={styles.list} aria-label="Saldos de estoque">
          {rows.map((r) => (
            <li key={r.productId} style={styles.row}>
              <span style={styles.main}>
                <span style={styles.name}>{r.productName}</span>
                <span style={styles.meta}>{r.categoryName}</span>
              </span>
              <span
                style={{ ...styles.balance, ...(r.balance.startsWith('-') ? styles.negative : null) }}
                className="tj-tnum"
              >
                {r.balance}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const styles: Record<string, CSSProperties> = {
  card: { width: '100%', maxWidth: '640px', display: 'grid', gap: 'var(--tj-space-3)' },
  title: {
    margin: 0,
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '28px',
    lineHeight: 1.15,
    letterSpacing: '-0.5px',
    color: 'var(--tj-ink)',
  },
  help: { margin: 0, fontSize: '14px', color: 'var(--tj-muted)', maxWidth: '58ch' },
  form: { display: 'grid', gap: 'var(--tj-space-3)' },
  filterLabel: {
    display: 'grid',
    gap: 'var(--tj-space-1)',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  select: { minHeight: '44px' },
  fields: { display: 'grid', gridTemplateColumns: 'minmax(120px, 160px) 1fr', gap: 'var(--tj-space-3)' },
  saved: {
    margin: 0,
    padding: 'var(--tj-space-2) var(--tj-space-3)',
    fontSize: '14px',
    fontWeight: 500,
    borderRadius: 'var(--tj-radius-input)',
    color: 'var(--tj-ready-text)',
    background: 'var(--tj-ready-pale)',
  },
  listTitle: {
    margin: 'var(--tj-space-2) 0 0',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
  },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--tj-space-3)',
    padding: 'var(--tj-space-2) 0',
    borderTop: '1px solid var(--tj-hairline)',
  },
  main: { display: 'grid', flex: 1, minWidth: 0 },
  name: { fontSize: '15px', fontWeight: 500, color: 'var(--tj-body)' },
  meta: { fontSize: '13px', color: 'var(--tj-faint)' },
  balance: { fontSize: '16px', fontWeight: 600, color: 'var(--tj-ink)' },
  negative: { color: 'var(--tj-danger-text)' },
};
