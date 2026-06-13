import { useEffect, useState } from 'react';
import type { HealthResponse } from '@teu-jardim/shared';

type Health = HealthResponse & { db: 'up' | 'down' };

export function App(): React.JSX.Element {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<Health>)
      .then(setHealth)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#1c1f1b',
        color: '#e8eae5',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontWeight: 600 }}>Teu Jardim PDV</h1>
        <p style={{ opacity: 0.6 }}>walking skeleton</p>
        <pre
          style={{
            textAlign: 'left',
            background: '#14160f',
            padding: '1rem',
            borderRadius: 8,
            minWidth: 280,
          }}
        >
          {error
            ? `API indisponível: ${error}`
            : health
              ? JSON.stringify(health, null, 2)
              : 'verificando API…'}
        </pre>
      </div>
    </main>
  );
}
