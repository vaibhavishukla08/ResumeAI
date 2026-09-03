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
  TemplateSector,
  User,
} from '@shared/types';

const BASE = '/api';
const CSRF_COOKIE = 'ra_csrf';
const CSRF_HEADER = 'X-CSRF-Token';

/**
 * The session credential is an httpOnly cookie the browser attaches on its
 * own. There is deliberately no token accessor here: if page scripts could
 * read the session, so could any injected script.
 *
 * The CSRF token is a different thing — it is *meant* to be readable, because
 * proving we can read our own cookie is what a cross-site request cannot do.
 */
function csrfToken(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

/** Thrown for every non-2xx response, carrying the status for callers to branch on. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Machine-readable discriminator, e.g. EMAIL_NOT_VERIFIED. */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    // Without this the browser withholds the session cookie entirely.
    credentials: 'include',
    headers: { [CSRF_HEADER]: csrfToken(), ...(init.headers ?? {}) },
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body: unknown = isJson ? await res.json().catch(() => ({})) : null;

  if (!res.ok) {
    const detail = body as { error?: string; code?: string } | null;
    throw new ApiError(
      detail?.error ?? `Request failed (${res.status})`,
      res.status,
      detail?.code,
    );
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
  /** Returns an acknowledgement, not a session — the address must be confirmed first. */
  register: (payload: {
    name: string; email: string; password: string;
    company?: string; website_url?: string;
  }) =>
    send<{ ok: true; message: string }>('POST', '/auth/register', payload),
  login: (payload: { email: string; password: string }) =>
    send<AuthResponse>('POST', '/auth/login', payload),
  google: (credential: string) => send<AuthResponse>('POST', '/auth/google', { credential }),
  /** One click into the shared demo workspace; no credential to send. */
  demo: () => send<AuthResponse>('POST', '/auth/demo'),
  me: () => request<{ user: User }>('/auth/me'),
  logout: () => send<{ ok: true }>('POST', '/auth/logout'),
  logoutAll: () => send<{ ok: true; revoked: number }>('POST', '/auth/logout-all'),
  sessions: () =>
    request<{
      sessions: {
        id: string; current: boolean; createdAt: string;
        lastSeenAt: string; userAgent: string | null; ip: string | null;
      }[];
    }>('/auth/sessions'),

  verifyEmail: (token: string) =>
    send<{ ok: true; message: string }>('POST', '/auth/verify-email', { token }),
  resendVerification: (email: string) =>
    send<{ ok: true; message: string }>('POST', '/auth/resend-verification', { email }),
  forgotPassword: (email: string) =>
    send<{ ok: true; message: string }>('POST', '/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    send<{ ok: true; message: string }>('POST', '/auth/reset-password', { token, password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    send<{ ok: true; revoked: number }>('POST', '/auth/change-password', { currentPassword, newPassword }),

  /* ---- roles ---- */
  roles: () => request<{ roles: Role[] }>('/roles'),
  saveRole: (payload: RoleInput) => send<{ role: Role }>('POST', '/roles', payload),
  roleTemplates: () =>
    request<{ sectors: TemplateSector[]; count: number }>('/role-templates'),
  addRoleFromTemplate: (templateId: string) =>
    send<{ role: Role }>('POST', '/roles/from-template', { templateId }),
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
    const res = await fetch(`${BASE}/candidates/${id}/file`, { credentials: 'include' });
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
      // Cookies are not sent on XHR by default when credentials are involved.
      xhr.withCredentials = true;
      xhr.setRequestHeader(CSRF_HEADER, csrfToken());

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
        else reject(new ApiError(body.error ?? `Upload failed (${xhr.status})`, xhr.status));
      };
      xhr.onerror = () => reject(new ApiError('Network error during upload.', 0));
      xhr.send(form);
    });
  },
};
