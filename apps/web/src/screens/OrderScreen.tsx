import { useParams, useNavigate } from 'react-router-dom';

export function OrderScreen(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <main style={{ padding: 24, fontFamily: 'var(--tj-font-ui)' }}>
      <p>Conta {id}</p>
      <button type="button" onClick={() => navigate('/')}>
        Voltar
      </button>
    </main>
  );
}
