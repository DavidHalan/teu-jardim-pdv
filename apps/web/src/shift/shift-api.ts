import { api } from '../lib/api';
import type {
  BusinessSessionDto, RegisterDto, OpenSessionRequest, OpenRegisterRequest,
  CurrentSessionResponse, CurrentRegisterResponse,
} from '@teu-jardim/shared';

export const shiftApi = {
  currentSession: (): Promise<CurrentSessionResponse> => api.get('/business-sessions/current'),
  openSession: (body: OpenSessionRequest): Promise<BusinessSessionDto> =>
    api.post('/business-sessions', body),
  currentRegister: (): Promise<CurrentRegisterResponse> => api.get('/registers/current'),
  openRegister: (body: OpenRegisterRequest): Promise<RegisterDto> => api.post('/registers', body),
};
