import { NavLink, Outlet } from 'react-router-dom';
import { Role } from '@teu-jardim/shared';
import { useAuth } from '../auth/AuthContext';
import { ThemeToggle, Button } from '../shared/ui';

/**
 * Chrome do app autenticado (redesign v2 "Terminal"): sidebar por áreas no desktop
 * (OPERAÇÃO · GESTÃO), topbar compacta no mobile (garçom não navega gestão — cai direto
 * no quadro). A sidebar é "burra": mostra os links; cada página guarda o próprio acesso
 * (turno, papel). Backend é a fronteira real de permissão (I-16) — links ocultos por papel
 * são só UX. As páginas de conteúdo vivem no <Outlet/>. O banner de impressão (RB-051) é
 * global (App), acompanha também as telas imersivas fora do shell.
 */

interface NavItem {
  to: string;
  label: string;
  adminOnly?: boolean;
}

const OPERATION: NavItem[] = [
  { to: '/quadro', label: 'Quadro' },
  { to: '/caixa', label: 'Caixa' },
];

const MANAGEMENT: NavItem[] = [
  { to: '/relatorios', label: 'Relatórios' },
  { to: '/auditoria', label: 'Auditoria', adminOnly: true },
  { to: '/estoque', label: 'Estoque', adminOnly: true },
];

const ROLE_LABEL: Record<Role, string> = {
  [Role.EMPLOYEE]: 'Garçom',
  [Role.CASHIER]: 'Caixa',
  [Role.ADMIN]: 'Administrador',
};

export function AppShell(): React.JSX.Element {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const initials = (user?.name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  const renderGroup = (items: NavItem[]) =>
    items
      .filter((it) => !it.adminOnly || isAdmin)
      .map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) => (isActive ? 'tj-navrow tj-navrow--on' : 'tj-navrow')}
        >
          {it.label}
        </NavLink>
      ));

  return (
    <div className="tj-shell">
      <style>{shellCss}</style>

      {/* Sidebar (desktop) */}
      <aside className="tj-sidebar" aria-label="Navegação">
        <div className="tj-brand">
          <span className="tj-brand-mark" aria-hidden="true" />
          <span className="tj-brand-word">Teu Jardim</span>
        </div>
        <nav className="tj-nav">
          <p className="tj-navgrp">Operação</p>
          {renderGroup(OPERATION)}
          <p className="tj-navgrp">Gestão</p>
          {renderGroup(MANAGEMENT)}
        </nav>
        <div className="tj-sideuser">
          <span className="tj-avatar" aria-hidden="true">{initials}</span>
          <span className="tj-userblock">
            <span className="tj-username">{user?.name}</span>
            {user?.role ? <span className="tj-userrole">{ROLE_LABEL[user.role]}</span> : null}
          </span>
          <ThemeToggle />
        </div>
        <Button variant="secondary" fullWidth onClick={logout} style={{ minHeight: '44px' }}>
          Sair
        </Button>
      </aside>

      {/* Topbar (mobile) */}
      <header className="tj-topbar">
        <span className="tj-brand-word">Teu Jardim</span>
        <div className="tj-topbar-actions">
          <ThemeToggle />
          <Button variant="secondary" onClick={logout} style={{ minHeight: '44px', padding: '0 var(--tj-space-3)' }}>
            Sair
          </Button>
        </div>
      </header>

      <div className="tj-shell-main">
        <main className="tj-shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const shellCss = `
.tj-shell { min-height: 100vh; display: flex; flex-direction: column; background: var(--tj-canvas); }
.tj-shell-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.tj-shell-content { flex: 1; box-sizing: border-box; width: 100%; max-width: 1180px; margin: 0 auto; padding: var(--tj-space-lg); }

.tj-brand-word { font-family: var(--tj-font-ui); font-weight: 700; font-size: 16px; letter-spacing: -0.3px; color: var(--tj-ink); }
.tj-brand-mark { width: 20px; height: 20px; border-radius: 6px; background: var(--tj-accent); display: block; }

/* Topbar (mobile default) */
.tj-topbar { display: flex; align-items: center; justify-content: space-between; gap: var(--tj-space-3);
  padding: var(--tj-space-3) var(--tj-space-md); background: var(--tj-surface-1); border-bottom: 1px solid var(--tj-hairline); }
.tj-topbar-actions { display: flex; align-items: center; gap: var(--tj-space-2); }

/* Sidebar (hidden on mobile) */
.tj-sidebar { display: none; }

@media (min-width: 900px) {
  .tj-shell { flex-direction: row; }
  .tj-topbar { display: none; }
  .tj-sidebar { display: flex; flex-direction: column; gap: var(--tj-space-2); flex-shrink: 0;
    width: 206px; box-sizing: border-box; padding: var(--tj-space-md) var(--tj-space-sm);
    background: var(--tj-surface-1); border-right: 1px solid var(--tj-hairline);
    position: sticky; top: 0; height: 100vh; }
  .tj-brand { display: flex; align-items: center; gap: 9px; padding: 2px 8px var(--tj-space-sm); }
  .tj-nav { display: flex; flex-direction: column; gap: 1px; }
  .tj-navgrp { margin: var(--tj-space-md) 9px var(--tj-space-1); font-size: var(--tj-fs-eyebrow);
    font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--tj-muted); }
  .tj-navgrp:first-child { margin-top: 0; }
  .tj-navrow { display: flex; align-items: center; padding: 8px 9px; border-radius: var(--tj-radius-sm);
    font-family: var(--tj-font-ui); font-size: var(--tj-fs-ui); font-weight: 500; color: var(--tj-body);
    text-decoration: none; min-height: 40px; box-sizing: border-box;
    transition: background 120ms ease, color 120ms ease; }
  .tj-navrow:hover { background: var(--tj-surface-2); }
  .tj-navrow--on { background: var(--tj-accent-tint); color: var(--tj-accent-deep); font-weight: 600; }
  .tj-navrow:focus-visible { outline: 2px solid var(--tj-focus); outline-offset: 2px; }
  .tj-sideuser { margin-top: auto; display: flex; align-items: center; gap: 9px;
    padding: var(--tj-space-2) 4px var(--tj-space-2); border-top: 1px solid var(--tj-hairline); }
  .tj-avatar { width: 28px; height: 28px; flex-shrink: 0; border-radius: 999px; background: var(--tj-surface-2);
    display: grid; place-items: center; font-size: 11px; font-weight: 700; color: var(--tj-ink); }
  .tj-userblock { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .tj-username { font-size: 13px; font-weight: 600; color: var(--tj-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tj-userrole { font-size: 11px; color: var(--tj-muted); }
}
`;
