import { useAuth } from '../auth/AuthContext';

export function Home(): React.JSX.Element {
  const { user, logout } = useAuth();
  return (
    <main style={{ fontFamily: 'var(--tj-font-ui)', padding: 'var(--tj-space-5)' }}>
      <h1 style={{ fontFamily: 'var(--tj-font-display)' }}>Teu Jardim PDV</h1>
      <p>Logado como <strong>{user?.name}</strong> ({user?.role}).</p>
      <p style={{ opacity: 0.6 }}>Abrir turno / lançar pedido entram na próxima fatia.</p>
      <button type="button" onClick={logout}>Sair</button>
    </main>
  );
}
