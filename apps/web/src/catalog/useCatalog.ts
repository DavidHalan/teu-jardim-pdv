import { useEffect, useState } from 'react';
import type { CategoryDto } from '@teu-jardim/shared';
import { catalogApi } from './catalog-api';

interface CatalogState {
  loading: boolean;
  categories: CategoryDto[];
  error: boolean;
}

/** Carrega o catálogo uma vez (read-only). */
export function useCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ loading: true, categories: [], error: false });

  useEffect(() => {
    let alive = true;
    catalogApi
      .getCatalog()
      .then((res) => alive && setState({ loading: false, categories: res.categories, error: false }))
      .catch(() => alive && setState({ loading: false, categories: [], error: true }));
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
