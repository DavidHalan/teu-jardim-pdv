import { useEffect, useId, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AuditEntryDto } from '@teu-jardim/shared';
import { auditApi } from './audit-api';
import { ApiError } from '../lib/api';
import { Alert, Button, Card, StatusPill } from '../shared/ui';

/** Rótulos PT dos eventos conhecidos; tipo novo cai no valor cru (nunca esconde evento). */
const EVENT_LABEL: Record<string, string> = {
  AUTH_LOGIN: 'Login',
  LOGIN_FAILED: 'Login falhou',
  SESSION_OPEN: 'Operação aberta',
  SESSION_CLOSE: 'Operação encerrada',
  REGISTER_OPEN: 'Caixa aberto',
  REGISTER_CLOSE: 'Caixa fechado',
  CASH_WITHDRAWAL: 'Sangria',
  CASH_SUPPLY: 'Suprimento',
  ACCOUNT_OPEN: 'Conta aberta',
  ACCOUNT_CANCEL: 'Conta cancelada',
  ACCOUNT_REOPENED: 'Conta reaberta',
  ORDER_PLACED: 'Pedido lançado',
  ITEM_CANCELED: 'Item cancelado',
  ITEM_TRANSFERRED: 'Item transferido',
  DISCOUNT_APPLIED: 'Desconto',
  PAYMENT_SETTLED: 'Pagamento',
  PAYMENT_REVERSED: 'Estorno',
  PRINT_JOB_EXPIRED: 'Cupom expirou',
  PRINT_ALERT_DISMISSED: 'Alerta ciente',
};

// Atenção operacional (âmbar) p/ exceções e falhas; resto neutro.
const WARN_EVENTS = new Set([
  'LOGIN_FAILED',
  'ACCOUNT_CANCEL',
  'ITEM_CANCELED',
  'DISCOUNT_APPLIED',
  'PAYMENT_REVERSED',
  'PRINT_JOB_EXPIRED',
]);

/**
 * Trilha de auditoria (RB-043/044) — Admin, somente leitura. Entradas de EVENTO
 * (quem/quando/quê/motivo), não diff de campos. "Carregar mais" = cursor keyset.
 */
export function AuditPanel(): React.JSX.Element {
  const id = useId();
  const [eventType, setEventType] = useState('');
  const [entries, setEntries] = useState<AuditEntryDto[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    auditApi
      .query({ eventType: eventType || undefined })
      .then((res) => {
        if (alive) {
          setEntries(res.entries);
          setNextCursor(res.nextCursor);
        }
      })
      .catch((err) => {
        if (alive) setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a auditoria.');
      });
    return () => {
      alive = false;
    };
  }, [eventType]);

  function switchType(next: string): void {
    setEntries(null); // recarrega do zero no novo filtro
    setNextCursor(null);
    setError(null);
    setEventType(next);
  }

  function loadMore(): void {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    auditApi
      .query({ eventType: eventType || undefined, cursor: nextCursor })
      .then((res) => {
        setEntries((cur) => [...(cur ?? []), ...res.entries]);
        setNextCursor(res.nextCursor);
      })
      .catch(() => setError('Não foi possível carregar mais entradas.'))
      .finally(() => setLoadingMore(false));
  }

  return (
    <Card style={styles.card} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} style={styles.title}>
        Auditoria
      </h2>
      <p style={styles.help}>
        Trilha imutável dos eventos críticos — quem fez, quando e por quê. Somente leitura.
      </p>

      <label style={styles.filterLabel} htmlFor={`${id}-type`}>
        Tipo de evento
        <select
          id={`${id}-type`}
          value={eventType}
          onChange={(e) => switchType(e.target.value)}
          style={styles.select}
          className="tj-input"
        >
          <option value="">Todos</option>
          {Object.entries(EVENT_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <Alert>{error}</Alert>
      ) : entries === null ? (
        <p style={styles.help} aria-live="polite">
          Carregando trilha…
        </p>
      ) : entries.length === 0 ? (
        <p style={styles.help}>Nenhum evento com este filtro.</p>
      ) : (
        <>
          <ul style={styles.list} aria-label="Eventos de auditoria">
            {entries.map((e) => (
              <li key={e.id} style={styles.row}>
                <span style={styles.time} className="tj-tnum">
                  {formatWhen(e.createdAt)}
                </span>
                <span style={styles.main}>
                  <StatusPill
                    label={EVENT_LABEL[e.eventType] ?? e.eventType}
                    tone={WARN_EVENTS.has(e.eventType) ? 'cooking' : 'pending'}
                    dot={false}
                  />
                  <span style={styles.meta}>
                    {e.userName ?? 'sistema'}
                    {e.reason ? ` — ${e.reason}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {nextCursor ? (
            <Button variant="secondary" onClick={loadMore} busy={loadingMore} fullWidth>
              {loadingMore ? 'Carregando…' : 'Carregar mais'}
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  help: { margin: 0, fontSize: '14px', color: 'var(--tj-muted)' },
  filterLabel: {
    display: 'grid',
    gap: 'var(--tj-space-1)',
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--tj-muted)',
    maxWidth: '280px',
  },
  select: { minHeight: '44px' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--tj-space-3)',
    padding: 'var(--tj-space-2) 0',
    borderTop: '1px solid var(--tj-hairline)',
  },
  time: { fontSize: '13px', color: 'var(--tj-faint)', minWidth: '78px' },
  main: { display: 'flex', alignItems: 'center', gap: 'var(--tj-space-2)', flex: 1, minWidth: 0, flexWrap: 'wrap' },
  meta: { fontSize: '14px', color: 'var(--tj-body)' },
};
