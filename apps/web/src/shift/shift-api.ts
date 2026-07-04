import { api } from '../lib/api';
import { uuid } from '../lib/uuid';
import type {
  BusinessSessionDto, RegisterDto, OpenSessionRequest, OpenRegisterRequest,
  CurrentSessionResponse, CurrentRegisterResponse,
  RegisterCloseSummary, CloseRegisterRequest, RegisterClosedDto,
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
  closeSession: (): Promise<BusinessSessionDto> => api.post('/business-sessions/current/close', {}),
};
