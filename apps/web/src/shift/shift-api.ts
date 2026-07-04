import { api } from '../lib/api';
import { uuid } from '../lib/uuid';
import type {
  BusinessSessionDto, RegisterDto, OpenSessionRequest, OpenRegisterRequest,
  CurrentSessionResponse, CurrentRegisterResponse,
  RegisterCloseSummary, CloseRegisterRequest, RegisterClosedDto,
  CashMovementDto, CashWithdrawalRequest, CashSupplyRequest, RegisterMovementsResponse,
} from '@teu-jardim/shared';

export const shiftApi = {
  currentSession: (): Promise<CurrentSessionResponse> => api.get('/business-sessions/current'),
  openSession: (body: OpenSessionRequest): Promise<BusinessSessionDto> =>
    api.post('/business-sessions', body),
  currentRegister: (): Promise<CurrentRegisterResponse> => api.get('/registers/current'),
  openRegister: (body: OpenRegisterRequest): Promise<RegisterDto> => api.post('/registers', body),
  closingSummary: (): Promise<RegisterCloseSummary> => api.get('/registers/current/closing-summary'),
  // Chave nova por chamada = por intenção (ADR-0026 §14).
  closeRegister: (body: CloseRegisterRequest): Promise<RegisterClosedDto> =>
    api.post('/registers/current/close', body, { idempotencyKey: uuid() }),
  // Sangria/Suprimento (RB-052): comandos financeiros — idem-key por intenção.
  registerWithdrawal: (body: CashWithdrawalRequest): Promise<CashMovementDto> =>
    api.post('/registers/current/withdrawals', body, { idempotencyKey: uuid() }),
  registerSupply: (body: CashSupplyRequest): Promise<CashMovementDto> =>
    api.post('/registers/current/supplies', body, { idempotencyKey: uuid() }),
  movements: (): Promise<RegisterMovementsResponse> => api.get('/registers/current/movements'),
  closeSession: (): Promise<BusinessSessionDto> => api.post('/business-sessions/current/close', {}),
};
