import { api } from '../lib/api';
import type { AuditQueryResponse } from '@teu-jardim/shared';

export interface AuditFilters {
  eventType?: string;
  cursor?: string;
}

export const auditApi = {
  // Trilha imutável (RB-044) — Admin, read-only, desc, cursor keyset.
  query: (filters: AuditFilters = {}): Promise<AuditQueryResponse> => {
    const params = new URLSearchParams();
    if (filters.eventType) params.set('eventType', filters.eventType);
    if (filters.cursor) params.set('cursor', filters.cursor);
    const qs = params.toString();
    return api.get(`/audit${qs ? `?${qs}` : ''}`);
  },
};
