import { api } from '../lib/api';
import { uuid } from '../lib/uuid';
import type {
  PayRequest,
  PaymentDto,
  PaymentListResponse,
  ReversePaymentRequest,
} from '@teu-jardim/shared';

export const paymentsApi = {
  // Chave nova por chamada = por intenção (cada clique re-lê estado e decide de novo — ADR-0023).
  pay: (body: PayRequest): Promise<PaymentDto> =>
    api.post('/payments', body, { idempotencyKey: uuid() }),
  // Pagamentos da operação corrente (base do estorno), mais recente primeiro.
  list: (): Promise<PaymentListResponse> => api.get('/payments'),
  // Estorno (RB-048): comando financeiro — motivo obrigatório, idem-key por intenção.
  reverse: (paymentId: string, body: ReversePaymentRequest): Promise<PaymentDto> =>
    api.post(`/payments/${paymentId}/reverse`, body, { idempotencyKey: uuid() }),
};
