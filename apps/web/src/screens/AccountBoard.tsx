import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabType } from '@teu-jardim/shared';
import type { AccountSummaryDto } from '@teu-jardim/shared';
import { accountsApi } from '../accounts/accounts-api';
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';
import { Alert, Segmented } from '../shared/ui';

/**
 * Quadro de contas (tela principal de atendimento, estilo grid de comandas do print).
 * Abas Comanda/Pulseira/Mesa; grid responsivo (auto-fill → nº de colunas segue o viewport).
 * Tile em-uso (conta aberta) = borda oliva + total; livre = número apagado → abre a conta.
 * Filtro Todas/Abertas + busca por número (abre qualquer número, preserva domínio livre RB-003).
 * Estado por vislumbre (cor+forma+texto). `placeOrder` é a rota quente — alvo grande, 1 toque.
 */

/** Range base por tipo (ajuste aqui). O grid cresce além disto se houver nº aberto maior. */
const BASE_RANGE: Record<TabType, number> = {
  [TabType.COMANDA]: 60,
  [TabType.WRISTBAND]: 50,
  [TabType.TABLE]: 30,
};

const TAB_ORDER: TabType[] = [TabType.COMANDA, TabType.WRISTBAND, TabType.TABLE];
const TAB_LABEL: Record<TabType, string> = {
  [TabType.COMANDA]: 'Comandas',
  [TabType.WRISTBAND]: 'Pulseiras',
  [TabType.TABLE]: 'Mesas',
};

const OFFLINE = 'Sem conexão com o servidor. Verifique a rede e tente de novo.';

export function AccountBoard(): React.JSX.Element {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>(TabType.COMANDA);
  const [filter, setFilter] = useState<'all' | 'open'>('all');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    accountsApi
      .list()
      .then((r) => alive && setAccounts(r.accounts))
      .catch(() => alive && setError(OFFLINE))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const byNumber = useMemo(() => {
    const m = new Map<number, AccountSummaryDto>();
    for (const a of accounts) if (a.tabType === tab) m.set(a.number, a);
    return m;
  }, [accounts, tab]);

  const numbers = useMemo(() => {
    const maxOpen = [...byNumber.keys()].reduce((m, n) => Math.max(m, n), 0);
    const max = Math.max(BASE_RANGE[tab], maxOpen);
    const list = Array.from({ length: max }, (_, i) => i + 1);
    const q = query.trim();
    const qn = Number(q);
    // número buscado além do range → vira tile abrível (domínio de número é livre)
    if (q && Number.isInteger(qn) && qn > 0 && qn > max) list.push(qn);
    return list;
  }, [byNumber, tab, query]);

  const tiles = useMemo(() => {
    const q = query.trim();
    return numbers.filter((n) => {
      if (filter === 'open' && !byNumber.has(n)) return false;
      if (q && !String(n).startsWith(q)) return false;
      return true;
    });
  }, [numbers, byNumber, filter, query]);

  const openCount = byNumber.size;

  function onTile(n: number): void {
    const acc = byNumber.get(n);
    if (acc) {
      navigate(`/conta/${acc.id}`);
      return;
    }
    if (opening) return;
    setOpening(true);
    setError(null);
    accountsApi
      .open({ tabType: tab, number: n })
      .then((a) => navigate(`/conta/${a.id}`))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : OFFLINE);
        setOpening(false);
      });
  }

  return (
    <section style={styles.board} aria-label="Quadro de contas">
      <style>{gridCss}</style>

      <div style={styles.controls}>
        <Segmented
          ariaLabel="Tipo de conta"
          options={TAB_ORDER.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
          value={tab}
          onChange={(t) => {
            setTab(t);
            setQuery('');
          }}
        />
        <div style={styles.toolbar}>
          <div style={styles.searchWrap}>
            <span aria-hidden="true" style={styles.searchIcon}>
              ⌕
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={query}
              onChange={(e) => setQuery(e.target.value.replace(/\D/g, ''))}
              placeholder={`Nº da ${tab === TabType.TABLE ? 'mesa' : tab === TabType.WRISTBAND ? 'pulseira' : 'comanda'}`}
              aria-label="Buscar número"
              style={styles.search}
              className="tj-input"
            />
          </div>
          <Segmented
            ariaLabel="Filtrar contas"
            options={[
              { value: 'all', label: 'Todas' },
              { value: 'open', label: `Abertas${openCount ? ` (${openCount})` : ''}` },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {loading ? (
        <div style={styles.grid} className="tj-board-grid" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <div key={i} style={styles.skelTile} />
          ))}
        </div>
      ) : tiles.length === 0 ? (
        <p style={styles.empty}>
          {filter === 'open' ? 'Nenhuma conta aberta neste tipo.' : 'Nenhum número para mostrar.'}
        </p>
      ) : (
        <div style={styles.grid} className="tj-board-grid">
          {tiles.map((n) => {
            const acc = byNumber.get(n);
            const inUse = acc !== undefined;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onTile(n)}
                disabled={opening && !inUse}
                className="tj-press tj-card"
                style={{ ...styles.tile, ...(inUse ? styles.tileInUse : null) }}
                aria-label={
                  inUse
                    ? `${TAB_LABEL[tab].slice(0, -1)} ${n}, aberta, ${formatBRL(acc.total)}`
                    : `Abrir ${TAB_LABEL[tab].slice(0, -1).toLowerCase()} ${n}`
                }
              >
                <span
                  style={{ ...styles.tileNumber, color: inUse ? 'var(--tj-ink)' : 'var(--tj-faint)' }}
                  className="tj-tnum"
                >
                  {n}
                </span>
                {inUse ? (
                  <span style={styles.tileMeta}>
                    <span style={styles.tileTotal} className="tj-tnum">
                      {formatBRL(acc.total)}
                    </span>
                    <span style={styles.tileCount}>{itemCountLabel(acc.itemCount)}</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function itemCountLabel(n: number): string {
  if (n === 0) return 'sem itens';
  return n === 1 ? '1 item' : `${n} itens`;
}

const styles: Record<string, CSSProperties> = {
  board: { display: 'grid', gap: 'var(--tj-space-4)' },
  controls: { display: 'grid', gap: 'var(--tj-space-3)' },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--tj-space-3)',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center', flex: '1 1 220px' },
  searchIcon: {
    position: 'absolute',
    left: 'var(--tj-space-3)',
    fontSize: '18px',
    color: 'var(--tj-muted)',
    pointerEvents: 'none',
  },
  search: {
    boxSizing: 'border-box',
    width: '100%',
    minHeight: '46px',
    padding: '0 var(--tj-space-3) 0 40px',
    fontFamily: 'var(--tj-font-ui)',
    fontSize: 'var(--tj-fs-body)',
    color: 'var(--tj-ink)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-input)',
    outline: 'none',
    fontVariantNumeric: 'tabular-nums',
  },
  grid: {
    display: 'grid',
    gap: 'var(--tj-space-3)',
    gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
  },
  tile: {
    display: 'grid',
    gap: '2px',
    justifyItems: 'center',
    alignContent: 'center',
    minHeight: '96px',
    padding: 'var(--tj-space-3) var(--tj-space-2)',
    background: 'var(--tj-surface)',
    border: '1px solid var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-md)',
    cursor: 'pointer',
  },
  tileInUse: { border: '1.5px solid var(--tj-brand)' },
  tileNumber: {
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '30px',
    lineHeight: 1.05,
    letterSpacing: '-0.5px',
  },
  tileMeta: { display: 'grid', justifyItems: 'center', gap: '0px' },
  tileTotal: { fontSize: '13px', fontWeight: 700, color: 'var(--tj-body)' },
  tileCount: { fontSize: '11px', color: 'var(--tj-faint)' },
  skelTile: {
    minHeight: '96px',
    background: 'var(--tj-canvas-soft)',
    borderRadius: 'var(--tj-radius-md)',
  },
  empty: { margin: 0, fontSize: '15px', color: 'var(--tj-muted)' },
};

// minmax responsivo já dá colunas por viewport; sobe o piso em telas largas p/ tiles maiores.
const gridCss = `
@media (min-width: 900px) {
  .tj-board-grid { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
}
`;
