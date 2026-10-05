// API client with auth token management

const DEFAULT_PROD_API = 'https://banking-application-pesy.onrender.com';

const API_HOST = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
  ? String(import.meta.env.VITE_API_URL).trim().replace(/\/$/, '')
  : '';

// Default to same-origin '/api' (reverse-proxied by Vercel or Vite dev server)
export const BASE_URL = API_HOST ? `${API_HOST}/api` : '/api';

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
      let res: Response | null = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      }).catch(async () => {
        if (!API_HOST && BASE_URL === '/api') {
          return fetch(`${DEFAULT_PROD_API}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: token }),
          }).catch(() => null);
        }
        return null;
      });

      if (!res || !res.ok) {
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

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
    });
  } catch (primaryErr: any) {
    // If same-origin '/api' failed, try direct Render backend fallback
    if (!API_HOST && BASE_URL === '/api') {
      try {
        res = await fetch(`${DEFAULT_PROD_API}/api${path}`, {
          ...init,
          headers,
        });
      } catch (fallbackErr: any) {
        throw {
          error: {
            message: fallbackErr?.message || primaryErr?.message || 'Network request failed. Please check your connection.',
          },
        };
      }
    } else {
      throw {
        error: {
          message: primaryErr?.message ? `Network request failed: ${primaryErr.message}` : 'Network error. Please check your backend connection.',
        },
      };
    }
  }

  // Auto-refresh on 401
  if (res.status === 401 && !skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${_accessToken}`;
      const retry = await fetch(`${BASE_URL}${path}`, { ...init, headers });
      if (!retry.ok) {
        const err = await retry.json().catch(() => ({ error: { message: `Request failed with status ${retry.status}` } }));
        throw err;
      }
      return retry.json();
    } else {
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(async () => {
      const text = await res.text().catch(() => '');
      return {
        error: {
          message: text.slice(0, 150) || `Request failed with status ${res.status}`,
        },
      };
    });
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw {
      error: {
        message: 'Received invalid response from server. Please check the backend.',
      },
    };
  }
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

  refresh: (refreshToken: string) =>
    request<any>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
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
