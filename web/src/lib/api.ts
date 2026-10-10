/**
 * Thin typed fetch wrapper around the AllocFlow API.
 *
 * Centralising the bearer token and error normalisation here means components
 * never touch fetch directly, and a 401 anywhere in the app logs the user out
 * in one place rather than being handled ad hoc at each call site.
 */

const TOKEN_KEY = 'allocflow.token';

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* private browsing — the session simply will not survive a reload */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public payload?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Called when the API rejects a token, so the app can drop to the login screen. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();

    // The API returns `message` as a string, or as an array when several
    // validation rules failed at once.
    const p = payload as { message?: string | string[] } | null;
    const message = Array.isArray(p?.message)
      ? p!.message.join(' ')
      : (p?.message ?? `Request failed (${res.status})`);
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}
