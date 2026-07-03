import { describe, it, expect, beforeEach } from 'vitest';
import { authStore } from './auth-store';
import type { AuthUser } from '@teu-jardim/shared';

const user: AuthUser = { id: 'u1', name: 'Ana', role: 'CASHIER' as AuthUser['role'] };

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.clear();
  });

  it('starts empty', () => {
    expect(authStore.getState().token).toBeNull();
    expect(authStore.getState().user).toBeNull();
  });

  it('persists token + user to localStorage on set', () => {
    authStore.set('tok123', user);
    expect(authStore.getState().token).toBe('tok123');
    expect(authStore.getState().user).toEqual(user);
    // sobrevive a um "reload": rehidrata do localStorage
    authStore.hydrate();
    expect(authStore.getState().token).toBe('tok123');
  });

  it('clears token + user', () => {
    authStore.set('tok123', user);
    authStore.clear();
    expect(authStore.getState().token).toBeNull();
    expect(localStorage.getItem('tj.auth')).toBeNull();
  });

  it('notifies subscribers on change', () => {
    let calls = 0;
    const unsub = authStore.subscribe(() => { calls += 1; });
    authStore.set('tok123', user);
    authStore.clear();
    unsub();
    expect(calls).toBe(2);
  });
});
