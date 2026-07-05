import { api } from '../lib/api';
import type { StockBalanceResponse, StockMovementDto, StockMovementRequest } from '@teu-jardim/shared';

export const stockApi = {
  // Saldo derivado (RB-046) — Admin (RB-054).
  balances: (): Promise<StockBalanceResponse> => api.get('/stock'),
  move: (body: StockMovementRequest): Promise<StockMovementDto> => api.post('/stock/movements', body),
};
