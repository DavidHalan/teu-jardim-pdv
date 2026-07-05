import { api } from '../lib/api';
import type {
  ClosingReport,
  ExceptionsReport,
  ReportKind,
  SalesByMethodReport,
  SalesByProductReport,
  TicketReport,
} from '@teu-jardim/shared';

export interface ReportByKind {
  closing: ClosingReport;
  'sales-by-method': SalesByMethodReport;
  'sales-by-product': SalesByProductReport;
  exceptions: ExceptionsReport;
  ticket: TicketReport;
}

export const reportsApi = {
  // Operação corrente por default (RB-053); pós-encerramento passa businessSessionId.
  get: <K extends ReportKind>(kind: K, businessSessionId?: string): Promise<ReportByKind[K]> =>
    api.get(
      `/reports/${kind}${businessSessionId ? `?businessSessionId=${businessSessionId}` : ''}`,
    ),
};
