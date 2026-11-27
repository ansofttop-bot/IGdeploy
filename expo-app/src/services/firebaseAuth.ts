import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { IGSEEK_CONFIG } from "../config";
import { AuthSession } from "../types/models";

WebBrowser.maybeCompleteAuthSession();

const FIREBASE_API_KEY = IGSEEK_CONFIG.firebase.apiKey;
const IDENTITY_BASE = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN_BASE = "https://securetoken.googleapis.com/v1/token";

function randomState(len = 24): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function mapFirebaseAuthError(code: string, lang: "ru" | "en"): string {
  const clean = (code || "").split(":")[0].trim().toUpperCase();
  const ru: Record<string, string> = {
    EMAIL_EXISTS: "Аккаунт с этой почтой уже зарегистрирован. Войдите в него.",
    EMAIL_NOT_FOUND: "Аккаунт с такой почтой не найден.",
    INVALID_PASSWORD: "Неверный пароль.",
    INVALID_LOGIN_CREDENTIALS: "Неверная почта или пароль.",
    INVALID_EMAIL: "Некорректный формат электронной почты.",
    WEAK_PASSWORD: "Пароль слишком слабый (минимум 6 символов).",
    USER_DISABLED: "Этот аккаунт отключён.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Слишком много попыток. Попробуйте чуть позже.",
  };
  const en: Record<string, string> = {
    EMAIL_EXISTS: "An account with this email already exists. Please sign in.",
    EMAIL_NOT_FOUND: "No account found with this email.",
    INVALID_PASSWORD: "Incorrect password.",
    INVALID_LOGIN_CREDENTIALS: "Invalid email or password.",
    INVALID_EMAIL: "Invalid email address format.",
    WEAK_PASSWORD: "Password is too weak (minimum 6 characters).",
    USER_DISABLED: "This account has been disabled.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Please try again later.",
  };
  const map = lang === "en" ? en : ru;
  return map[clean] || (lang === "en" ? `Auth error: ${clean || "Unknown"}` : `Ошибка входа: ${clean || "Неизвестная"}`);
}

export async function signInWithEmail(
  email: string,
  password: string,
  lang: "ru" | "en" = "ru"
): Promise<AuthSession> {
  const res = await fetch(
    `${IDENTITY_BASE}/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
        returnSecureToken: true,
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(mapFirebaseAuthError(data?.error?.message, lang));
  }
  const expiresSec = Number(data.expiresIn || 3600);
  return {
    uid: String(data.localId || ""),
    email: String(data.email || email.trim()),
    displayName: String(data.displayName || email.trim().split("@")[0] || "IGseek User"),
    idToken: String(data.idToken || ""),
    refreshToken: String(data.refreshToken || ""),
    provider: "password",
    isGuest: false,
    expiresAtMs: Date.now() + expiresSec * 1000,
  };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
  lang: "ru" | "en" = "ru"
): Promise<AuthSession> {
  const res = await fetch(
    `${IDENTITY_BASE}/accounts:signUp?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
        returnSecureToken: true,
      }),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(mapFirebaseAuthError(data?.error?.message, lang));
  }

  const cleanName = displayName.trim() || email.trim().split("@")[0] || "IGseek User";
  if (data.idToken && cleanName) {
    // Best-effort profile displayName update
    fetch(`${IDENTITY_BASE}/accounts:update?key=${encodeURIComponent(FIREBASE_API_KEY)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: data.idToken,
        displayName: cleanName,
        returnSecureToken: false,
      }),
    }).catch(() => undefined);
  }

  const expiresSec = Number(data.expiresIn || 3600);
  return {
    uid: String(data.localId || ""),
    email: String(data.email || email.trim()),
    displayName: cleanName,
    idToken: String(data.idToken || ""),
    refreshToken: String(data.refreshToken || ""),
    provider: "password",
    isGuest: false,
    expiresAtMs: Date.now() + expiresSec * 1000,
  };
}

export async function refreshAuthSession(session: AuthSession): Promise<AuthSession> {
  if (session.isGuest || !session.refreshToken) return session;
  // Still valid for at least 5 more minutes
  if (session.expiresAtMs > Date.now() + 5 * 60 * 1000 && session.idToken) {
    return session;
  }

  const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(session.refreshToken)}`;
  const res = await fetch(
    `${SECURE_TOKEN_BASE}?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id_token) {
    return session;
  }
  const expiresSec = Number(data.expires_in || 3600);
  return {
    ...session,
    uid: String(data.user_id || session.uid),
    idToken: String(data.id_token),
    refreshToken: String(data.refresh_token || session.refreshToken),
    expiresAtMs: Date.now() + expiresSec * 1000,
  };
}

export async function signInWithGoogle(lang: "ru" | "en" = "ru"): Promise<AuthSession> {
  const state = randomState(28);
  const redirectUri = Linking.createURL("auth");
  const bridgeUrl =
    `${IGSEEK_CONFIG.authBridgeUrl}/login?mobile_auth=1` +
    `&state=${encodeURIComponent(state)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  const result = await WebBrowser.openAuthSessionAsync(bridgeUrl, redirectUri);
  if (result.type !== "success" || !result.url) {
    throw new Error(
      lang === "en" ? "Google sign-in was cancelled." : "Вход через Google был отменён."
    );
  }

  const parsed = Linking.parse(result.url);
  const qp = parsed.queryParams || {};

  // Also parse fragment params if any
  const hashPart = result.url.includes("#") ? result.url.split("#")[1] : "";
  const hashParams: Record<string, string> = {};
  if (hashPart) {
    for (const pair of hashPart.split("&")) {
      const [k, v] = pair.split("=");
      if (k) hashParams[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
  }

  const getParam = (key: string): string => {
    const val = qp[key];
    if (typeof val === "string" && val) return val;
    if (Array.isArray(val) && val[0]) return val[0];
    return hashParams[key] || "";
  };

  const returnedError = getParam("error");
  if (returnedError) {
    throw new Error(returnedError);
  }

  const returnedState = getParam("state");
  if (returnedState && returnedState !== state) {
    throw new Error(
      lang === "en" ? "Security state mismatch during Google sign-in." : "Ошибка проверки state при входе через Google."
    );
  }

  const idToken = getParam("id_token");
  const refreshToken = getParam("refresh_token");
  const uid = getParam("uid");
  const email = getParam("email");
  const name = getParam("name") || email.split("@")[0] || "IGseek User";

  if (!idToken || !uid) {
    throw new Error(
      lang === "en"
        ? "Could not receive Firebase token from Google sign-in."
        : "Не удалось получить токен Firebase после входа через Google."
    );
  }

  return {
    uid,
    email,
    displayName: name,
    idToken,
    refreshToken,
    provider: "google",
    isGuest: false,
    expiresAtMs: Date.now() + 55 * 60 * 1000,
  };
}

export function createGuestSession(lang: "ru" | "en" = "ru"): AuthSession {
  return {
    uid: `guest_${Date.now().toString(36)}`,
    email: "",
    displayName: lang === "en" ? "Guest" : "Гость",
    idToken: "",
    refreshToken: "",
    provider: "guest",
    isGuest: true,
    expiresAtMs: Date.now() + 365 * 24 * 60 * 60 * 1000,
  };
}
