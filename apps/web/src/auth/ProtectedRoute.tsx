import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}
