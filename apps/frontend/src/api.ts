// API client with auth token management

const API_HOST = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
  ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
  : '';
const BASE_URL = API_HOST ? `${API_HOST}/api` : '/api';

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

let _accessToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
let _refreshToken: string | null = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;

export function setTokens(access: string, refresh: string) {
  _accessToken = access;
  _refreshToken = refresh;
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem('refresh_token');
}

let _refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    const token = _refreshToken ?? getStoredRefreshToken();
    if (!token) return false;

    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      });

      if (!res.ok) {
        clearTokens();
        return false;
      }

      const data = await res.json();
      if (data.success && data.data?.accessToken) {
        setTokens(data.data.accessToken, data.data.refreshToken);
        return true;
      }
      clearTokens();
      return false;
    } catch {
      clearTokens();
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

async function request<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { skipAuth, ...init } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (!skipAuth && _accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  // Auto-refresh on 401
  if (res.status === 401 && !skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${_accessToken}`;
      const retry = await fetch(`${BASE_URL}${path}`, { ...init, headers });
      if (!retry.ok) {
        const err = await retry.json();
        throw err;
      }
      return retry.json();
    } else {
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: 'Request failed' } }));
    throw err;
  }

  return res.json();
}

// ── Auth API ────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    }),

  register: (email: string, password: string, firstName: string, lastName: string) =>
    request<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, firstName, lastName }),
      skipAuth: true,
    }),

  logout: (refreshToken: string) =>
    request<any>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),

  me: () => request<any>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<any>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
};

// ── Account API ─────────────────────────────────────────────

export const accountApi = {
  list: () => request<any>('/accounts'),

  get: (id: string) => request<any>(`/accounts/${id}`),

  create: (accountType?: string) =>
    request<any>('/accounts', {
      method: 'POST',
      body: JSON.stringify({ accountType }),
    }),

  ledger: (id: string, page = 1, limit = 20) =>
    request<any>(`/accounts/${id}/ledger?page=${page}&limit=${limit}`),
};

// ── Transfer API ─────────────────────────────────────────────

export const transferApi = {
  create: (
    sourceAccountId: string,
    destinationAccountId: string,
    amount: number,
    description: string,
    idempotencyKey: string,
  ) =>
    request<any>('/transfers', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ sourceAccountId, destinationAccountId, amount, description }),
    }),

  get: (id: string) => request<any>(`/transfers/${id}`),

  listForAccount: (accountId: string, page = 1) =>
    request<any>(`/accounts-transfers/${accountId}/transfers?page=${page}`),
};
