/**
 * Server-only client for the FastAPI ML backend (backend/). Every call here
 * runs inside a Next.js API route (never in the browser), so the backend's
 * researcher key and participant tokens never reach client JS. This is the
 * single place that knows the backend's base URL and auth headers.
 */
import { cookies } from 'next/headers';

const SESSION_COOKIE = 'ml_backend_token';

function baseUrl(): string {
  const url = process.env.ML_BACKEND_URL;
  if (!url) throw new Error('ML_BACKEND_URL is not configured.');
  return url.replace(/\/$/, '');
}

function researcherKey(): string {
  const key = process.env.ML_BACKEND_RESEARCHER_KEY;
  if (!key) throw new Error('ML_BACKEND_RESEARCHER_KEY is not configured.');
  return key;
}

export class MlBackendError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
    if (body.detail) return JSON.stringify(body.detail);
  } catch {
    // fall through to status text
  }
  return response.statusText || 'ML backend request failed.';
}

/** Create a fresh participant session using the server-held researcher key. */
export async function createParticipantSession(): Promise<{ token: string; expiresAt: string }> {
  const response = await fetch(`${baseUrl()}/v1/study-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Researcher-Key': researcherKey() },
    body: JSON.stringify({ participantRef: `corbel-demo-${Date.now()}`, expiresInHours: 8 }),
    cache: 'no-store',
  });
  if (!response.ok) throw new MlBackendError(response.status, await parseError(response));
  const body = (await response.json()) as { participantToken: string; expiresAt: string };
  return { token: body.participantToken, expiresAt: body.expiresAt };
}

export { SESSION_COOKIE };

async function setSessionCookie(token: string, expiresAt: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  });
}

/** Reads the session cookie, creating a fresh backend session if none exists yet. */
export async function getOrCreateParticipantToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing) return existing;
  const { token, expiresAt } = await createParticipantSession();
  await setSessionCookie(token, expiresAt);
  return token;
}

/**
 * Call the backend with a participant Bearer token, transparently retrying
 * once with a freshly-created session if the stored token has expired
 * (backend returns 401). Demo sessions are single-participant and short, so
 * silently rotating the token here is simpler than surfacing re-auth to the UI.
 */
export async function callAsParticipant(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getOrCreateParticipantToken();
  const attempt = () =>
    fetch(`${baseUrl()}/${path.replace(/^\//, '')}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

  const response = await attempt();
  if (response.status !== 401) return response;

  const fresh = await createParticipantSession();
  await setSessionCookie(fresh.token, fresh.expiresAt);
  return fetch(`${baseUrl()}/${path.replace(/^\//, '')}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${fresh.token}` },
    cache: 'no-store',
  });
}

/** Call a researcher-only backend route using the server-held key. */
export async function callAsResearcher(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl()}/${path.replace(/^\//, '')}`, {
    ...init,
    headers: { ...(init.headers ?? {}), 'X-Researcher-Key': researcherKey() },
    cache: 'no-store',
  });
}

/** Throws MlBackendError if the response isn't ok; otherwise returns parsed JSON. */
export async function jsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) throw new MlBackendError(response.status, await parseError(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
