import { useCallback, useEffect, useState } from 'react';
import type { BusinessSessionDto, RegisterDto } from '@teu-jardim/shared';
import { shiftApi } from './shift-api';

interface ShiftState {
  loading: boolean;
  session: BusinessSessionDto | null;
  register: RegisterDto | null;
}

/** Carrega operação + caixa correntes; expõe refresh para reusar após abrir. */
export function useShift(): ShiftState & { refresh: () => Promise<void> } {
  const [state, setState] = useState<ShiftState>({ loading: true, session: null, register: null });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const { session } = await shiftApi.currentSession();
    const register = session ? (await shiftApi.currentRegister()).register : null;
    setState({ loading: false, session, register });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}
