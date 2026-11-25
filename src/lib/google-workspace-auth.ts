import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth } from './firebase';

/**
 * Exact least-privilege Google Workspace scopes provisioned for this Firebase/GCP project.
 * One sign-in authorizes Gmail, Google Calendar, and Google Tasks simultaneously.
 */
export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks',
] as const;

// Strictly in-memory OAuth access token cache (never persisted in localStorage/sessionStorage).
let cachedWorkspaceToken: string | null = null;
let cachedWorkspaceEmail: string | null = null;
let authListenerBound = false;

function dispatchWorkspaceAuthEvents(connected: boolean, email?: string | null) {
  if (typeof window === 'undefined') return;
  const detail = { connected, email: email ?? null };
  window.dispatchEvent(new CustomEvent('igseek:workspace-auth-changed', { detail }));
  window.dispatchEvent(new CustomEvent('igseek:gmail-auth-changed', { detail }));
  window.dispatchEvent(new CustomEvent('igseek:calendar-auth-changed', { detail }));
  window.dispatchEvent(new CustomEvent('igseek:tasks-auth-changed', { detail }));
}

function ensureAuthSignOutListener() {
  if (authListenerBound || typeof window === 'undefined') return;
  authListenerBound = true;
  try {
    onAuthStateChanged(auth, (user) => {
      if (!user && cachedWorkspaceToken) {
        cachedWorkspaceToken = null;
        cachedWorkspaceEmail = null;
        dispatchWorkspaceAuthEvents(false, null);
      }
    });
  } catch {
    // Ignore if Firebase auth is unavailable in non-browser contexts
  }
}

ensureAuthSignOutListener();

export function getWorkspaceAccessToken(): string | null {
  ensureAuthSignOutListener();
  return cachedWorkspaceToken;
}

export function getWorkspaceUserEmail(): string | null {
  return cachedWorkspaceEmail || auth.currentUser?.email || null;
}

export function setWorkspaceAccessToken(token: string | null, email?: string | null): void {
  ensureAuthSignOutListener();
  cachedWorkspaceToken = token;
  if (token === null) {
    cachedWorkspaceEmail = null;
  } else if (email !== undefined) {
    cachedWorkspaceEmail = email;
  }
  dispatchWorkspaceAuthEvents(!!token, cachedWorkspaceEmail);
}

export function clearWorkspaceAccessToken(): void {
  setWorkspaceAccessToken(null, null);
}

export async function connectGoogleWorkspace(): Promise<{ accessToken: string; userEmail?: string }> {
  ensureAuthSignOutListener();
  try {
    const provider = new GoogleAuthProvider();
    GOOGLE_WORKSPACE_SCOPES.forEach((scope) => {
      provider.addScope(scope);
    });
    provider.setCustomParameters({
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);

    if (!credential?.accessToken) {
      throw new Error('Failed to retrieve Google Workspace OAuth access token.');
    }

    const userEmail = result.user.email ?? undefined;
    setWorkspaceAccessToken(credential.accessToken, userEmail ?? null);
    return {
      accessToken: credential.accessToken,
      userEmail,
    };
  } catch (error: any) {
    const code = error?.code || '';
    if (code === 'auth/popup-closed-by-user') {
      throw new Error('Google sign-in window was closed before completing authorization.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Browser blocked the Google sign-in popup. Please allow popups and try again.');
    }
    if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      throw new Error(
        `Domain "${host}" is not in Firebase Authorized Domains. Add it in Firebase Console → Authentication → Settings → Authorized domains.`
      );
    }
    throw error;
  }
}

export async function parseGoogleApiError(res: Response, serviceName: string): Promise<string> {
  const raw = await res.text().catch(() => '');
  let detail = '';
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      detail = parsed?.error?.message || parsed?.message || raw;
    } catch {
      detail = raw;
    }
  }
  if (res.status === 401) {
    return `${serviceName}: Google session expired. Please sign in to Google again.`;
  }
  if (res.status === 403) {
    return detail
      ? `${serviceName} permission error (403): ${detail}`
      : `${serviceName}: Missing Google Workspace permissions. Please reconnect Google and grant all requested permissions.`;
  }
  return `${serviceName} API error (${res.status}): ${detail || res.statusText}`;
}
