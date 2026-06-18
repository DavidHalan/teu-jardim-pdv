import { api } from '../lib/api';
import type {
  AccountDto,
  AccountListResponse,
  OpenAccountRequest,
  PlaceItemsRequest,
} from '@teu-jardim/shared';

export const accountsApi = {
  open: (body: OpenAccountRequest): Promise<AccountDto> => api.post('/accounts', body),
  list: (): Promise<AccountListResponse> => api.get('/accounts'),
  get: (id: string): Promise<AccountDto> => api.get(`/accounts/${id}`),
  placeItems: (id: string, body: PlaceItemsRequest): Promise<AccountDto> =>
    api.post(`/accounts/${id}/items`, body),
};
