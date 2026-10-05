import { QueryClient } from '@tanstack/react-query';
import { useSessionStore, type UserProfile } from './session';

export const API_BASE_URL =
  (import.meta.env.ERP_API_BASE_URL as string | undefined) ||
  'https://ata-lta-erp-api-staging.onrender.com/v1';

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: string;

  constructor(status: number, message: string, detail?: string, code?: string) {
    super(detail || message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export const getToken = (): string | null => {
  try {
    return localStorage.getItem('erp_access_token');
  } catch {
    return null;
  }
};

export const getRefreshToken = (): string | null => {
  try {
    return localStorage.getItem('erp_refresh_token');
  } catch {
    return null;
  }
};

export const setTokens = (accessToken: string, refreshToken?: string): void => {
  try {
    localStorage.setItem('erp_access_token', accessToken);
    if (refreshToken) {
      localStorage.setItem('erp_refresh_token', refreshToken);
    }
  } catch {
    // ignore
  }
};

export const clearTokens = (): void => {
  try {
    localStorage.removeItem('erp_access_token');
    localStorage.removeItem('erp_refresh_token');
  } catch {
    // ignore
  }
};

/**
 * Global QueryClient per Spec §3.1:
 * staleTime: 30s, retry: 1
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const cleanPath = path.startsWith('/v1/') ? path.slice(3) : path === '/v1' ? '' : path;
  const url = `${API_BASE_URL}${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}`;
  const token = getToken();
  const activeEntity = useSessionStore.getState().activeEntity;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token && !options.skipAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (activeEntity && activeEntity !== 'ALL' && !headers['X-Active-Entity'] && !headers['x-active-entity']) {
    headers['X-Active-Entity'] = activeEntity;
  }
  if (headers['X-Active-Entity'] === 'ALL') {
    delete headers['X-Active-Entity'];
  }
  if (headers['x-active-entity'] === 'ALL') {
    delete headers['x-active-entity'];
  }

  const methodUpper = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(methodUpper) && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `idemp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  let res = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 with token refresh attempt (Spec 3.2, R6)
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshRes.ok) {
          const refreshJson = (await refreshRes.json()) as {
            data: { accessToken: string; refreshToken?: string };
          };
          const { accessToken, refreshToken: newRefresh } = refreshJson.data;
          setTokens(accessToken, newRefresh);
          headers['Authorization'] = `Bearer ${accessToken}`;

          res = await fetch(url, {
            ...options,
            headers,
          });

          if (res.status !== 401) {
            if (res.status === 204) {
              return null as T;
            }
            return (await res.json()) as T;
          }
        }
      } catch (refreshErr) {
        console.error('[api] Refresh failed:', refreshErr);
      }
    }

    // Refresh failed or retry returned 401 -> logout & redirect (R6)
    clearTokens();
    useSessionStore.getState().clearSession();
    queryClient.clear();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Unauthorized', 'Session expired. Please sign in again.');
  }

  if (!res.ok) {
    let errorDetail = `HTTP ${res.status}`;
    let errorCode: string | undefined;
    try {
      const errBody = (await res.json()) as { message?: string; detail?: string; code?: string; title?: string };
      errorDetail = errBody.detail || errBody.message || errBody.title || errorDetail;
      errorCode = errBody.code;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, res.statusText, errorDetail, errorCode);
  }

  if (res.status === 204) {
    return null as T;
  }

  return (await res.json()) as T;
}

export interface SignInResponse {
  data: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
}

export interface MeResponse {
  data: UserProfile & {
    activeEntity?: string;
    permissions?: string[];
    unread_notifications?: number;
  };
}

export async function signIn(email: string, password: string): Promise<SignInResponse['data']> {
  const result = await apiRequest<SignInResponse>('/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    skipAuth: true,
  });
  setTokens(result.data.accessToken, result.data.refreshToken);
  return result.data;
}

export async function getMe(): Promise<MeResponse['data']> {
  const result = await apiRequest<MeResponse>('/me');
  return result.data;
}

export function signOut(): void {
  clearTokens();
  useSessionStore.getState().clearSession();
  queryClient.clear();
}
