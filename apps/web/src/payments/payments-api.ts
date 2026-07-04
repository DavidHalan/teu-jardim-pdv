import { api } from '../lib/api';
import { uuid } from '../lib/uuid';
import type { PayRequest, PaymentDto } from '@teu-jardim/shared';

export const paymentsApi = {
  // Chave nova por chamada = por intenção (cada clique re-lê estado e decide de novo — ADR-0023).
  pay: (body: PayRequest): Promise<PaymentDto> =>
    api.post('/payments', body, { idempotencyKey: uuid() }),
};
