import { useEffect, useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { Role } from '@teu-jardim/shared';
import type {
  ClosingReport,
  ExceptionsReport,
  ReportKind,
  SalesByMethodReport,
  SalesByProductReport,
  TicketReport,
} from '@teu-jardim/shared';
import { reportsApi } from './reports-api';
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';
import { Alert, Card, Segmented, StatusPill } from '../shared/ui';

const KIND_LABEL: Record<ReportKind, string> = {
  closing: 'Fechamento',
  'sales-by-method': 'Por forma',
  'sales-by-product': 'Por produto',
  exceptions: 'Exceções',
  ticket: 'Ticket médio',
};

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CREDIT: 'Crédito',
  DEBIT: 'Débito',
};

const EXCEPTION_LABEL: Record<string, string> = {
  ITEM_CANCELED: 'Item cancelado',
  ACCOUNT_CANCEL: 'Conta cancelada',
  DISCOUNT_APPLIED: 'Desconto',
  PAYMENT_REVERSED: 'Estorno',
};

type AnyReport =
  | ClosingReport
  | SalesByMethodReport
  | SalesByProductReport
  | ExceptionsReport
  | TicketReport;

/**
 * 5 relatórios da operação corrente (RB-053), query-time. Acesso RB-053a espelhado
 * na UI (UX-only — o backend revalida): Caixa vê só o Fechamento; Admin vê todos.
 */
export function ReportsPanel({ role }: { role: Role }): React.JSX.Element {
  const id = useId();
  const kinds: ReportKind[] =
    role === Role.ADMIN
      ? ['closing', 'sales-by-method', 'sales-by-product', 'exceptions', 'ticket']
      : ['closing'];
  const [kind, setKind] = useState<ReportKind>('closing');
  const [report, setReport] = useState<AnyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function switchKind(next: ReportKind): void {
    setReport(null); // volta ao estado "carregando" antes do fetch do effect
    setError(null);
    setKind(next);
  }

  useEffect(() => {
    let alive = true;
    reportsApi
      .get(kind)
      .then((r) => {
        if (alive) setReport(r);
      })
      .catch((err) => {
        if (alive) {
          setError(
            err instanceof ApiError && (err.status === 409 || err.status === 403)
              ? err.message
              : 'Não foi possível carregar o relatório.',
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  return (
    <Card style={styles.card} aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`} style={styles.title}>
        Relatórios da operação
      </h2>

      {kinds.length > 1 ? (
        <Segmented
          ariaLabel="Relatório"
          options={kinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          value={kind}
          onChange={switchKind}
        />
      ) : (
        <p style={styles.help}>Fechamento e diferença por caixa. Os demais relatórios são do Administrador.</p>
      )}

      {error ? (
        <Alert>{error}</Alert>
      ) : report === null ? (
        <p style={styles.help} aria-live="polite">
          Carregando relatório…
        </p>
      ) : kind === 'closing' ? (
        <Closing report={report as ClosingReport} />
      ) : kind === 'sales-by-method' ? (
        <SalesByMethod report={report as SalesByMethodReport} />
      ) : kind === 'sales-by-product' ? (
        <SalesByProduct report={report as SalesByProductReport} />
      ) : kind === 'exceptions' ? (
        <Exceptions report={report as ExceptionsReport} />
      ) : (
        <Ticket report={report as TicketReport} />
      )}
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }): React.JSX.Element {
  return (
    <div style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={{ ...styles.rowValue, ...(strong ? styles.rowStrong : null) }} className="tj-tnum">
        {value}
      </span>
    </div>
  );
}

function Closing({ report }: { report: ClosingReport }): React.JSX.Element {
  if (report.registers.length === 0) return <p style={styles.help}>Nenhum caixa nesta operação.</p>;
  return (
    <div style={styles.blocks}>
      {report.registers.map((r) => (
        <section key={r.registerId} style={styles.block} aria-label={`Caixa de ${r.operatorName}`}>
          <div style={styles.blockHead}>
            <span style={styles.blockTitle}>{r.operatorName}</span>
            <StatusPill
              label={r.status === 'CLOSED' ? 'Fechado' : 'Aberto'}
              tone={r.status === 'CLOSED' ? 'ready' : 'brand'}
              dot={false}
            />
          </div>
          <Row label="Abertura" value={formatBRL(r.openingAmount)} />
          <Row label="Recebido em dinheiro" value={formatBRL(r.cashReceipts)} />
          <Row label="Suprimentos" value={`+${formatBRL(r.cashSupplies)}`} />
          <Row label="Sangrias" value={`−${formatBRL(r.cashWithdrawals)}`} />
          <Row label="Estornos" value={`−${formatBRL(r.cashReversals)}`} />
          <Row label="Esperado" value={formatBRL(r.expectedAmount)} strong />
          {r.countedAmount !== null ? (
            <>
              <Row label="Contado" value={formatBRL(r.countedAmount)} strong />
              <Row label="Diferença" value={formatBRL(r.difference ?? '0.00')} strong />
            </>
          ) : (
            <p style={styles.help}>Caixa ainda aberto — contagem entra no fechamento.</p>
          )}
        </section>
      ))}
    </div>
  );
}

function SalesByMethod({ report }: { report: SalesByMethodReport }): React.JSX.Element {
  if (report.rows.length === 0) return <p style={styles.help}>Nenhuma venda nesta operação ainda.</p>;
  return (
    <div style={styles.block}>
      {report.rows.map((r) => (
        <Row key={r.method} label={METHOD_LABEL[r.method] ?? r.method} value={formatBRL(r.total)} />
      ))}
      <Row label="Total" value={formatBRL(report.total)} strong />
    </div>
  );
}

function SalesByProduct({ report }: { report: SalesByProductReport }): React.JSX.Element {
  if (report.rows.length === 0) return <p style={styles.help}>Nenhuma venda nesta operação ainda.</p>;
  return (
    <ul style={styles.list} aria-label="Vendas por produto">
      {report.rows.map((r) => (
        <li key={r.productId} style={styles.listRow}>
          <span style={styles.listMain}>
            <span style={styles.listName}>{r.productName}</span>
            <span style={styles.listMeta}>
              {r.categoryName} · {r.weightGrams > 0 ? `${r.weightGrams}g` : `${r.quantity}x`}
            </span>
          </span>
          <span style={styles.rowValue} className="tj-tnum">
            {formatBRL(r.total)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Exceptions({ report }: { report: ExceptionsReport }): React.JSX.Element {
  if (report.rows.length === 0) {
    return <p style={styles.help}>Nenhuma exceção nesta operação — nenhum cancelamento, desconto ou estorno.</p>;
  }
  return (
    <ul style={styles.list} aria-label="Exceções da operação">
      {report.rows.map((r, i) => (
        <li key={i} style={styles.listRow}>
          <span style={styles.listTime} className="tj-tnum">
            {new Date(r.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span style={styles.listMain}>
            <StatusPill label={EXCEPTION_LABEL[r.type] ?? r.type} tone="cooking" dot={false} />
            <span style={styles.listMeta}>
              {r.operatorName}
              {r.reason ? ` — ${r.reason}` : ''}
            </span>
          </span>
          {r.detail ? (
            <span style={styles.rowValue} className="tj-tnum">
              {formatBRL(r.detail)}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Ticket({ report }: { report: TicketReport }): React.JSX.Element {
  return (
    <div style={styles.block}>
      <Row label="Contas pagas" value={String(report.accountCount)} />
      <Row label="Receita" value={formatBRL(report.revenue)} />
      <Row label="Ticket médio" value={formatBRL(report.average)} strong />
    </div>
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
  help: { margin: 0, fontSize: '14px', color: 'var(--tj-muted)' },
  blocks: { display: 'grid', gap: 'var(--tj-space-4)' },
  block: { display: 'grid', gap: 'var(--tj-space-1)' },
  blockHead: { display: 'flex', alignItems: 'center', gap: 'var(--tj-space-2)', marginBottom: 'var(--tj-space-1)' },
  blockTitle: { fontSize: '15px', fontWeight: 600, color: 'var(--tj-body)' },
  row: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 'var(--tj-space-3)',
    padding: '6px 0',
    borderTop: '1px solid var(--tj-hairline)',
  },
  rowLabel: { fontSize: '13px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tj-muted)' },
  rowValue: { fontSize: '16px', fontWeight: 600, color: 'var(--tj-ink)' },
  rowStrong: { fontSize: '18px', fontWeight: 700 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid' },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--tj-space-3)',
    padding: 'var(--tj-space-2) 0',
    borderTop: '1px solid var(--tj-hairline)',
  },
  listTime: { fontSize: '13px', color: 'var(--tj-faint)', minWidth: '42px' },
  listMain: { display: 'flex', alignItems: 'center', gap: 'var(--tj-space-2)', flex: 1, minWidth: 0, flexWrap: 'wrap' },
  listName: { fontSize: '15px', fontWeight: 500, color: 'var(--tj-body)' },
  listMeta: { fontSize: '13px', color: 'var(--tj-faint)' },
};
