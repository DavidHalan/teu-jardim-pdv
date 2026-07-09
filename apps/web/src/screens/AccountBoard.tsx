import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabType } from '@teu-jardim/shared';
import type { AccountSummaryDto } from '@teu-jardim/shared';
import { accountsApi } from '../accounts/accounts-api';
import { formatBRL } from '../lib/money';
import { ApiError } from '../lib/api';
import { Alert, FilterChip, Kbd, KpiTile, Segmented, StatusBar } from '../shared/ui';

/**
 * Quadro de contas (tela principal — redesign v2 "Terminal" × Sischef). Strip de KPIs +
 * barra de comando (busca por número com atalho `/`, tipo, filtros) + grid de tiles com
 * estado por vislumbre (anel accent = em uso; anel warn = parada há +45 min) mostrando total,
 * tempo aberto e quem abriu + barra de status viva. Abas Comanda/Pulseira/Mesa; grid
 * responsivo. `placeOrder` é a rota quente — tile grande, 1 toque.
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
const STALE_MIN = 45; // conta parada há +45 min → anel de atenção (DESIGN.md v2)

type Filter = 'all' | 'open' | 'stale';

export function AccountBoard(): React.JSX.Element {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [accounts, setAccounts] = useState<AccountSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  // Relógio: lazy init (leitura de Date.now() fora do corpo puro do render).
  const [loadedAt, setLoadedAt] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  const [tab, setTab] = useState<TabType>(TabType.COMANDA);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    accountsApi
      .list()
      .then((r) => {
        if (!alive) return;
        setAccounts(r.accounts);
        setLoadedAt(Date.now());
      })
      .catch(() => alive && setError(OFFLINE))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Relógio de vislumbre: mantém "há X min" e "atualizado há" vivos sem re-buscar (read-snapshot).
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Atalho `/`: foca a busca por número (teclado é interface no PC do caixa).
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== '/' || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const byNumber = useMemo(() => {
    const m = new Map<number, AccountSummaryDto>();
    for (const a of accounts) if (a.tabType === tab) m.set(a.number, a);
    return m;
  }, [accounts, tab]);

  const openMinutes = (a: AccountSummaryDto): number =>
    Math.max(0, Math.floor((now - Date.parse(a.openedAt)) / 60_000));
  const isStale = (a: AccountSummaryDto): boolean => openMinutes(a) >= STALE_MIN;

  // KPIs do tipo corrente (do snapshot já carregado — sem fetch extra).
  const kpis = useMemo(() => {
    const open = [...byNumber.values()];
    const cents = open.reduce((s, a) => s + Math.round(Number(a.total) * 100), 0);
    const stale = open.filter(isStale).length;
    return { count: open.length, sum: (cents / 100).toFixed(2), stale };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` entra via isStale para reavaliar staleness a cada tick
  }, [byNumber, now]);

  const numbers = useMemo(() => {
    const maxOpen = [...byNumber.keys()].reduce((m, n) => Math.max(m, n), 0);
    const max = Math.max(BASE_RANGE[tab], maxOpen);
    const list = Array.from({ length: max }, (_, i) => i + 1);
    const q = query.trim();
    const qn = Number(q);
    if (q && Number.isInteger(qn) && qn > 0 && qn > max) list.push(qn);
    return list;
  }, [byNumber, tab, query]);

  const tiles = useMemo(() => {
    const q = query.trim();
    return numbers.filter((n) => {
      const acc = byNumber.get(n);
      if (filter === 'open' && !acc) return false;
      if (filter === 'stale' && !(acc && isStale(acc))) return false;
      if (q && !String(n).startsWith(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- staleness depende de `now`
  }, [numbers, byNumber, filter, query, now]);

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

  const noun = tab === TabType.TABLE ? 'mesa' : tab === TabType.WRISTBAND ? 'pulseira' : 'comanda';

  return (
    <section style={styles.board} aria-label="Quadro de contas">
      <style>{gridCss}</style>

      <div style={styles.kpiStrip} aria-label="Resumo do quadro">
        <KpiTile label="Contas abertas" value={String(kpis.count)} />
        <KpiTile label="Em aberto" value={formatBRL(kpis.sum)} />
        <KpiTile label={`Paradas +${STALE_MIN} min`} value={String(kpis.stale)} tone={kpis.stale > 0 ? 'warn' : 'default'} />
      </div>

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
              ref={searchRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={query}
              onChange={(e) => setQuery(e.target.value.replace(/\D/g, ''))}
              placeholder={`Nº da ${noun}`}
              aria-label="Buscar número"
              style={styles.searchInput}
              className="tj-input tj-tnum"
            />
            <span style={styles.searchKbd}>
              <Kbd>/</Kbd>
            </span>
          </div>
          <div style={styles.chips}>
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              Todas
            </FilterChip>
            <FilterChip active={filter === 'open'} onClick={() => setFilter('open')}>
              Abertas{kpis.count ? ` (${kpis.count})` : ''}
            </FilterChip>
            <FilterChip active={filter === 'stale'} onClick={() => setFilter('stale')}>
              Paradas{kpis.stale ? ` (${kpis.stale})` : ''}
            </FilterChip>
          </div>
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
          {filter === 'open'
            ? 'Nenhuma conta aberta neste tipo.'
            : filter === 'stale'
              ? `Nenhuma conta parada há mais de ${STALE_MIN} min.`
              : 'Nenhum número para mostrar.'}
        </p>
      ) : (
        <div style={styles.grid} className="tj-board-grid">
          {tiles.map((n) => {
            const acc = byNumber.get(n);
            const inUse = acc !== undefined;
            const stale = acc ? isStale(acc) : false;
            const tileStyle = inUse ? (stale ? styles.tileStale : styles.tileInUse) : null;
            return (
              <button
                key={n}
                type="button"
                onClick={() => onTile(n)}
                disabled={opening && !inUse}
                className="tj-press tj-card"
                style={{ ...styles.tile, ...tileStyle }}
                aria-label={
                  inUse
                    ? `${TAB_LABEL[tab].slice(0, -1)} ${n}, aberta há ${openMinutes(acc)} min por ${acc.openedBy}, ${formatBRL(acc.total)}`
                    : `Abrir ${noun} ${n}`
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
                    <span style={{ ...styles.tileSub, ...(stale ? styles.tileSubStale : null) }}>
                      {agoLabel(openMinutes(acc))} · {acc.openedBy}
                    </span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      {!loading ? (
        <StatusBar
          items={[
            { value: String(kpis.count), label: 'abertas' },
            { value: formatBRL(kpis.sum), label: 'em aberto' },
            { value: String(kpis.stale), label: `parada(s) +${STALE_MIN} min`, tone: kpis.stale > 0 ? 'warn' : 'default' },
          ]}
          right={`atualizado ${sinceLabel(now - loadedAt)}`}
        />
      ) : null}
    </section>
  );
}

function agoLabel(min: number): string {
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `há ${h} h` : `há ${h} h ${m} min`;
}

function sinceLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `há ${s} s`;
  return `há ${Math.floor(s / 60)} min`;
}

const styles: Record<string, CSSProperties> = {
  board: { display: 'grid', gap: 'var(--tj-space-4)' },
  kpiStrip: { display: 'flex', flexWrap: 'wrap', gap: 'var(--tj-space-2)' },
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
  searchInput: { paddingLeft: '40px', paddingRight: '40px' },
  searchKbd: {
    position: 'absolute',
    right: 'var(--tj-space-2)',
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  chips: { display: 'flex', gap: 'var(--tj-space-2)', flexWrap: 'wrap' },
  grid: {
    display: 'grid',
    gap: 'var(--tj-space-3)',
    gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))',
  },
  tile: {
    display: 'grid',
    gap: '4px',
    justifyItems: 'start',
    alignContent: 'space-between',
    textAlign: 'left',
    minHeight: '100px',
    padding: 'var(--tj-space-3)',
    background: 'var(--tj-canvas)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--tj-hairline)',
    borderRadius: 'var(--tj-radius-md)',
    cursor: 'pointer',
  },
  tileInUse: { borderColor: 'var(--tj-accent)', boxShadow: 'inset 0 0 0 1px var(--tj-accent)' },
  tileStale: { borderColor: 'var(--tj-warn)', boxShadow: 'inset 0 0 0 1px var(--tj-warn)' },
  tileNumber: {
    fontFamily: 'var(--tj-font-ui)',
    fontWeight: 700,
    fontSize: '30px',
    lineHeight: 1.05,
    letterSpacing: '-0.5px',
  },
  tileMeta: { display: 'grid', gap: '1px', width: '100%' },
  tileTotal: { fontSize: '14px', fontWeight: 600, color: 'var(--tj-ink)' },
  tileSub: {
    fontSize: '11px',
    color: 'var(--tj-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  tileSubStale: { color: 'var(--tj-warn)', fontWeight: 600 },
  skelTile: {
    minHeight: '100px',
    background: 'var(--tj-surface-1)',
    borderRadius: 'var(--tj-radius-md)',
  },
  empty: { margin: 0, fontSize: '15px', color: 'var(--tj-muted)' },
};

// minmax responsivo já dá colunas por viewport; sobe o piso em telas largas p/ tiles maiores.
const gridCss = `
@media (min-width: 900px) {
  .tj-board-grid { grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); }
}
`;
