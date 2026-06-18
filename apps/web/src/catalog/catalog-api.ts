import { api } from '../lib/api';
import type { CatalogResponse } from '@teu-jardim/shared';

export const catalogApi = {
  getCatalog: (): Promise<CatalogResponse> => api.get('/products/catalog'),
};
