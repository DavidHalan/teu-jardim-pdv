import { api } from '../lib/api';
import type { PayRequest, PaymentDto } from '@teu-jardim/shared';

export const paymentsApi = {
  pay: (body: PayRequest): Promise<PaymentDto> => api.post('/payments', body),
};
