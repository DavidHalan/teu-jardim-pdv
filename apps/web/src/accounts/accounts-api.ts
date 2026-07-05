import { api } from '../lib/api';
import { uuid } from '../lib/uuid';
import type {
  AccountDto,
  AccountListResponse,
  OpenAccountRequest,
  PlaceItemsRequest,
  ApplyDiscountRequest,
  CancelAccountRequest,
  CancelItemRequest,
  TransferItemRequest,
} from '@teu-jardim/shared';

export const accountsApi = {
  open: (body: OpenAccountRequest): Promise<AccountDto> => api.post('/accounts', body),
  list: (): Promise<AccountListResponse> => api.get('/accounts'),
  get: (id: string): Promise<AccountDto> => api.get(`/accounts/${id}`),
  // Chave nova por chamada = por intenção (ADR-0026 §14).
  placeItems: (id: string, body: PlaceItemsRequest): Promise<AccountDto> =>
    api.post(`/accounts/${id}/items`, body, { idempotencyKey: uuid() }),
  applyDiscount: (id: string, body: ApplyDiscountRequest): Promise<AccountDto> =>
    api.post(`/accounts/${id}/discount`, body),
  cancel: (id: string, body: CancelAccountRequest): Promise<AccountDto> =>
    api.post(`/accounts/${id}/cancel`, body),
  // Cancelar item (RB-029/031): motivo obrigatório; corrigir = cancelar + relançar (RB-056).
  cancelItem: (id: string, itemId: string, body: CancelItemRequest): Promise<AccountDto> =>
    api.post(`/accounts/${id}/items/${itemId}/cancel`, body),
  // Transferir item (RB-032/034): destino OPEN da operação; devolve a ORIGEM atualizada.
  transferItem: (id: string, itemId: string, body: TransferItemRequest): Promise<AccountDto> =>
    api.post(`/accounts/${id}/items/${itemId}/transfer`, body),
};
