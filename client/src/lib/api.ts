import type {
  AnalyzeResponse,
  AuthResponse,
  Candidate,
  CandidateSummary,
  CandidateStatus,
  CompareResponse,
  HealthResponse,
  Role,
  RoleInput,
  Skill,
  User,
} from '@shared/types';

const BASE = '/api';
const TOKEN_KEY = 'resumeai-token';

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

/** Thrown for every non-2xx response, carrying the status for callers to branch on. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function authHeaders(): Record<string, string> {
  const token = tokenStore.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body: unknown = isJson ? await res.json().catch(() => ({})) : null;

  if (!res.ok) {
    const message =
      (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    // An expired token should not leave the app in a half-authenticated state.
    if (res.status === 401) tokenStore.clear();
    throw new ApiError(message, res.status);
  }

  return body as T;
}

const send = <T>(method: string, path: string, payload?: unknown): Promise<T> =>
  request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

export const api = {
  /* ---- public ---- */
  health: () => request<HealthResponse>('/health'),
  skills: () => request<{ skills: Skill[]; categories: string[] }>('/skills'),

  /* ---- auth ---- */
  register: (payload: { name: string; email: string; password: string; company?: string }) =>
    send<AuthResponse>('POST', '/auth/register', payload),
  login: (payload: { email: string; password: string }) =>
    send<AuthResponse>('POST', '/auth/login', payload),
  google: (credential: string) => send<AuthResponse>('POST', '/auth/google', { credential }),
  me: () => request<{ user: User }>('/auth/me'),

  /* ---- roles ---- */
  roles: () => request<{ roles: Role[] }>('/roles'),
  saveRole: (payload: RoleInput) => send<{ role: Role }>('POST', '/roles', payload),
  deleteRole: (id: string) => request<{ ok: boolean }>(`/roles/${id}`, { method: 'DELETE' }),
  rescore: (id: string) => send<{ ok: boolean; updated: number }>('POST', `/roles/${id}/rescore`),

  /* ---- candidates ---- */
  candidates: (roleId?: string) =>
    request<{ candidates: CandidateSummary[] }>(
      `/candidates${roleId ? `?roleId=${encodeURIComponent(roleId)}` : ''}`,
    ),
  candidate: (id: string) => request<{ candidate: Candidate }>(`/candidates/${id}`),
  patchCandidate: (id: string, patch: { status?: CandidateStatus; note?: string }) =>
    send<{ candidate: CandidateSummary }>('PATCH', `/candidates/${id}`, patch),
  deleteCandidate: (id: string) =>
    request<{ ok: boolean }>(`/candidates/${id}`, { method: 'DELETE' }),
  clearCandidates: (roleId?: string) =>
    send<{ ok: boolean; removed: number }>('POST', '/candidates/clear', { roleId }),

  compare: (roleId: string, candidateIds?: string[]) =>
    send<CompareResponse>('POST', '/compare', { roleId, candidateIds }),

  /**
   * The preview pane needs an authenticated fetch, so it cannot just point an
   * <img>/<iframe> at the URL — this returns a blob URL the caller must revoke.
   */
  async fileBlobUrl(id: string): Promise<string> {
    const res = await fetch(`${BASE}/candidates/${id}/file`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError('Could not load the original file.', res.status);
    return URL.createObjectURL(await res.blob());
  },

  /** Batch upload with real progress, which fetch() cannot report. */
  analyze(
    roleId: string,
    files: File[],
    onProgress?: (fraction: number) => void,
  ): Promise<AnalyzeResponse> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('roleId', roleId);
      for (const file of files) form.append('resumes', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE}/analyze`);

      const token = tokenStore.get();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        let body: { error?: string } = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* handled below */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as unknown as AnalyzeResponse);
        else {
          if (xhr.status === 401) tokenStore.clear();
          reject(new ApiError(body.error ?? `Upload failed (${xhr.status})`, xhr.status));
        }
      };
      xhr.onerror = () => reject(new ApiError('Network error during upload.', 0));
      xhr.send(form);
    });
  },
};
