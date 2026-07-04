import { IDEMPOTENCY_KEY_HEADER } from '@teu-jardim/shared';
import { authStore } from './auth-store';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = authStore.getState().token;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401) {
    authStore.clear(); // token expirado/ausente → volta ao login
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(res.status, body.message ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // idempotencyKey: obrigatório nos comandos financeiros (pagar/lançar/fechar — ADR-0026 §14).
  post: <T>(path: string, body: unknown, opts?: { idempotencyKey?: string }): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: opts?.idempotencyKey ? { [IDEMPOTENCY_KEY_HEADER]: opts.idempotencyKey } : undefined,
    }),
  get: <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' }),
};
