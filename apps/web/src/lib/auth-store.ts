import type { AuthUser } from '@teu-jardim/shared';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

const STORAGE_KEY = 'tj.auth';
let state: AuthState = { token: null, user: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function persist(): void {
  if (state.token && state.user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const authStore = {
  getState(): AuthState {
    return state;
  },
  set(token: string, user: AuthUser): void {
    state = { token, user };
    persist();
    emit();
  },
  clear(): void {
    state = { token: null, user: null };
    persist();
    emit();
  },
  hydrate(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      state = JSON.parse(raw) as AuthState;
      emit();
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
