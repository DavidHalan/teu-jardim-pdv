import { api } from '../lib/api';
import type { PrintJobDto, PrintJobListResponse } from '@teu-jardim/shared';

export const printQueueApi = {
  // Alertas EXPIRED/FAILED do operador logado (RB-051 — direcionado a quem lançou).
  alerts: (): Promise<PrintJobListResponse> => api.get('/print-jobs/alerts'),
  // Ciência: o operador avisou a estação por voz (fallback RB-051).
  dismiss: (jobId: string): Promise<PrintJobDto> => api.post(`/print-jobs/${jobId}/dismiss`, {}),
};
