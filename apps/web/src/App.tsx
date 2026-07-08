import { Routes, Route, Navigate } from 'react-router-dom';
import { Role } from '@teu-jardim/shared';
import { useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './app/AppShell';
import { PrintAlertsBanner } from './print-queue/PrintAlertsBanner';
import { Login } from './screens/Login';
import { ShiftGate, QuadroPage } from './screens/Home';
import { CashPage } from './screens/CashPage';
import { OrderScreen } from './screens/OrderScreen';
import { PayScreen } from './screens/PayScreen';
import { ReportsPanel } from './reports/ReportsPanel';
import { AuditPanel } from './audit/AuditPanel';
import { StockPanel } from './stock/StockPanel';

/**
 * Roteamento (redesign v2 "Terminal"): áreas de gestão/operação vivem sob o <AppShell/>
 * (sidebar por áreas); as telas imersivas de conta (lançar/pagar) seguem standalone com
 * o próprio chrome. O banner de impressão (RB-051) é global para acompanhar o operador
 * em qualquer tela.
 */
export function App(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  return (
    <>
      {isAuthenticated ? <PrintAlertsBanner /> : null}
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />

        {/* Áreas com chrome de sidebar */}
        <Route element={isAuthenticated ? <AppShell /> : <Navigate to="/login" replace />}>
          <Route path="/" element={<ShiftGate />} />
          <Route path="/quadro" element={<QuadroPage />} />
          <Route path="/caixa" element={<CashPage />} />
          <Route path="/relatorios" element={<ReportsRoute />} />
          <Route path="/auditoria" element={<AuditPanel />} />
          <Route path="/estoque" element={<StockPanel />} />
        </Route>

        {/* Telas imersivas de conta (chrome próprio) */}
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

        <Route path="/lancar" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

/** Relatórios precisa do papel (RB-053a: garçom bloqueado; Caixa só fechamento). */
function ReportsRoute(): React.JSX.Element {
  const { user } = useAuth();
  return <ReportsPanel role={user?.role ?? Role.CASHIER} />;
}
