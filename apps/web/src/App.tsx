import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Login } from './screens/Login';
import { Home } from './screens/Home';
import { OrderScreen } from './screens/OrderScreen';
import { PayScreen } from './screens/PayScreen';

export function App(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      {/* Seleção de conta agora é o AccountBoard na Home (pós-turno). /lancar legado → Home. */}
      <Route path="/lancar" element={<Navigate to="/" replace />} />
      <Route
        path="/conta/:id"
        element={
          <ProtectedRoute>
            <OrderScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/conta/:id/pagar"
        element={
          <ProtectedRoute>
            <PayScreen />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
