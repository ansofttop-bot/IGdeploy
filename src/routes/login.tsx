import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sun, Moon, ChevronDown, Check, Loader2, ExternalLink } from "lucide-react";
import { getRedirectResult, signInWithRedirect } from "firebase/auth";
import { auth, googleProvider, signInWithPopup, signOut } from "@/lib/firebase";
import { firebaseClient } from "@/lib/firebase-service";
import { AuthCard } from "@/components/auth/AuthCard";
import { useTheme } from "@/lib/theme";

import { syncDocumentLang, useLang, useT, type LangCode } from "@/lib/i18n";

const LOGIN_LANGUAGES: { code: LangCode; native: string }[] = [
  { code: "en", native: "English" },
  { code: "ru", native: "Русский" },
  { code: "es", native: "Español" },
  { code: "fr", native: "Français" },
  { code: "ar", native: "العربية" },
];

function isSafeNext(v: string | undefined): v is string {
  return typeof v === "string" && v.startsWith("/") && !v.startsWith("//");
}

function isSafeMobileRedirectUri(raw: string | undefined): raw is string {
  if (!raw || typeof raw !== "string") return false;
  const trimmed = raw.trim();
  return (
    trimmed.startsWith("app.igseek.mobile://") ||
    trimmed.startsWith("igseek://") ||
    trimmed.startsWith("exp://") ||
    trimmed.startsWith("exps://")
  );
}

function buildMobileAuthDeepLink(params: {
  firebaseIdToken: string;
  refreshToken: string;
  uid: string;
  email: string;
  name: string;
  state: string;
  redirectUri?: string;
}): string {
  const hash = new URLSearchParams({
    firebase_id_token: params.firebaseIdToken,
    refresh_token: params.refreshToken,
    uid: params.uid,
    email: params.email,
    name: params.name,
    ...(params.state ? { state: params.state } : {}),
  }).toString();
  const base = isSafeMobileRedirectUri(params.redirectUri)
    ? params.redirectUri.trim().split("#")[0]
    : "app.igseek.mobile://auth";
  return `${base}#${hash}`;
}

const MOBILE_AUTH_STORAGE_KEY = "igseek:mobile_auth_pending";
const MOBILE_AUTH_STATE_KEY = "igseek:mobile_auth_state";
const MOBILE_AUTH_REDIRECT_KEY = "igseek:mobile_auth_redirect";

function persistMobileBridgeState(state: string, redirectUri?: string) {
  if (typeof window === "undefined") return;
  const safeRedirect = isSafeMobileRedirectUri(redirectUri) ? redirectUri.trim() : "";
  try {
    window.sessionStorage.setItem(MOBILE_AUTH_STORAGE_KEY, "1");
    if (state) window.sessionStorage.setItem(MOBILE_AUTH_STATE_KEY, state);
    if (safeRedirect) window.sessionStorage.setItem(MOBILE_AUTH_REDIRECT_KEY, safeRedirect);
  } catch {}
  try {
    window.localStorage.setItem(MOBILE_AUTH_STORAGE_KEY, String(Date.now()));
    if (state) window.localStorage.setItem(MOBILE_AUTH_STATE_KEY, state);
    if (safeRedirect) window.localStorage.setItem(MOBILE_AUTH_REDIRECT_KEY, safeRedirect);
  } catch {}
}

function readMobileBridgeState(): string {
  if (typeof window === "undefined") return "";
  try {
    const s = window.sessionStorage.getItem(MOBILE_AUTH_STATE_KEY);
    if (s) return s;
  } catch {}
  try {
    return window.localStorage.getItem(MOBILE_AUTH_STATE_KEY) || "";
  } catch {
    return "";
  }
}

function readMobileBridgeRedirect(): string {
  if (typeof window === "undefined") return "";
  try {
    const r = window.sessionStorage.getItem(MOBILE_AUTH_REDIRECT_KEY);
    if (isSafeMobileRedirectUri(r || undefined)) return r!;
  } catch {}
  try {
    const r = window.localStorage.getItem(MOBILE_AUTH_REDIRECT_KEY);
    if (isSafeMobileRedirectUri(r || undefined)) return r!;
  } catch {}
  return "";
}

function clearMobileBridgeState() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(MOBILE_AUTH_STORAGE_KEY);
    window.sessionStorage.removeItem(MOBILE_AUTH_STATE_KEY);
    window.sessionStorage.removeItem(MOBILE_AUTH_REDIRECT_KEY);
  } catch {}
  try {
    window.localStorage.removeItem(MOBILE_AUTH_STORAGE_KEY);
    window.localStorage.removeItem(MOBILE_AUTH_STATE_KEY);
    window.localStorage.removeItem(MOBILE_AUTH_REDIRECT_KEY);
  } catch {}
}

function isMobileBridgeSession(searchMobileAuth?: string): boolean {
  if (searchMobileAuth === "1") return true;
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(MOBILE_AUTH_STORAGE_KEY) === "1") return true;
  } catch {}
  try {
    const ts = Number(window.localStorage.getItem(MOBILE_AUTH_STORAGE_KEY) || "0");
    if (ts > 0 && Date.now() - ts < 10 * 60_000) return true;
  } catch {}
  return false;
}

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — IGseek" },
      { name: "description", content: "Sign in or create an IGseek account." },
      { property: "og:title", content: "Sign in — IGseek" },
      { property: "og:description", content: "Sign in or create an IGseek account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (
    s: Record<string, unknown>
  ): { next: string; mobile_auth: string; state: string; redirect_uri?: string } => ({
    next: typeof s.next === "string" ? s.next : "",
    mobile_auth: typeof s.mobile_auth === "string" ? s.mobile_auth : "",
    state: typeof s.state === "string" ? s.state : "",
    ...(typeof s.redirect_uri === "string" && s.redirect_uri ? { redirect_uri: s.redirect_uri } : {}),
  }),
  beforeLoad: async ({ search }) => {
    if (typeof window !== "undefined" && search.mobile_auth === "1") {
      persistMobileBridgeState(search.state, search.redirect_uri);
      return;
    }
    if (isMobileBridgeSession(search.mobile_auth)) return;
    const { data } = await firebaseClient.auth.getSession();
    if (data.session) {
      const target = isSafeNext(search.next) ? search.next : "/app";
      throw redirect({ to: target as any, replace: true });
    }
  },
  component: LoginPage,
});

function MobileGoogleAuthBridge({
  oauthState,
  redirectUri,
}: {
  oauthState: string;
  redirectUri?: string;
}) {
  const t = useT();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [resolvedState] = useState<string>(() => oauthState || readMobileBridgeState());
  const [resolvedRedirect] = useState<string>(() =>
    isSafeMobileRedirectUri(redirectUri) ? redirectUri.trim() : readMobileBridgeRedirect(),
  );

  const handoffUser = async (
    user: NonNullable<typeof auth.currentUser>,
    autoOpenApp: boolean,
  ) => {
    const idToken = await user.getIdToken(true);
    const refreshToken = (user as any).refreshToken || "";
    const email = user.email || "";
    const name = user.displayName || email.split("@")[0] || "User";
    const link = buildMobileAuthDeepLink({
      firebaseIdToken: idToken,
      refreshToken,
      uid: user.uid,
      email,
      name,
      state: resolvedState,
      redirectUri: resolvedRedirect,
    });
    setSignedInEmail(email || name);
    setDeepLink(link);
    setBusy(false);
    if (autoOpenApp) {
      clearMobileBridgeState();
      window.location.assign(link);
    }
  };

  useEffect(() => {
    let active = true;
    persistMobileBridgeState(oauthState || resolvedState);

    (async () => {
      try {
        if (typeof (auth as any).authStateReady === "function") {
          await Promise.race([
            (auth as any).authStateReady(),
            new Promise<void>((resolve) => setTimeout(resolve, 3000)),
          ]).catch(() => {});
        }
        const redirectRes = await getRedirectResult(auth).catch(() => null);
        if (!active) return;
        if (redirectRes?.user) {
          // User just returned from Google redirect flow -> auto-handoff once
          await handoffUser(redirectRes.user, true);
          return;
        }
        if (auth.currentUser) {
          // Existing browser session -> prepare instant one-tap deep link button WITHOUT auto-looping
          await handoffUser(auth.currentUser, false);
          return;
        }
      } catch (err: any) {
        if (active) setError(err?.message || t("Google sign-in failed. Please try again."));
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [oauthState]);

  const startGoogleSignIn = async (forceAccountPicker = false) => {
    setBusy(true);
    setError(null);
    persistMobileBridgeState(resolvedState);

    try {
      if (forceAccountPicker && auth.currentUser) {
        await signOut(auth).catch(() => {});
        setDeepLink(null);
        setSignedInEmail(null);
      }
      googleProvider.setCustomParameters({ prompt: "select_account" });
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        await handoffUser(cred.user, true);
      } catch (popupErr: any) {
        const code = popupErr?.code || "";
        if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
          await signInWithRedirect(auth, googleProvider);
          return;
        }
        throw popupErr;
      }
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setError(t("Google sign-in was cancelled."));
      } else {
        setError(err?.message || t("Google sign-in failed. Please try again."));
      }
      setBusy(false);
    }
  };

  return (
    <div className="relative z-10 w-full max-w-sm rounded-3xl border border-border bg-surface/95 p-7 shadow-2xl backdrop-blur-xl text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">IGseek</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {t("Continue with Google to sign in to the IGseek Android app.")}
      </p>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-500 text-left">
          {error}
        </div>
      )}

      {deepLink ? (
        <div className="mt-6 space-y-3">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-600 dark:text-emerald-400">
            {signedInEmail ? `${t("Signed in as")} ${signedInEmail}` : t("Signed in with Google")}
          </div>
          <a
            href={deepLink}
            onClick={() => clearMobileBridgeState()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <span>{t("Open IGseek app")}</span>
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => void startGoogleSignIn(true)}
            disabled={busy}
            className="w-full py-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {t("Use another Google account")}
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={() => void startGoogleSignIn(false)}
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{busy ? t("Connecting…") : t("Continue with Google")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function LoginPage() {
  const { next, mobile_auth, state, redirect_uri } = Route.useSearch();
  const isMobileBridge = isMobileBridgeSession(mobile_auth);
  const safeNext = isSafeNext(next) ? next : "/app";
  const navigate = useNavigate();
  const [theme, setTheme] = useTheme();
  const lang = useLang();
  const t = useT();
  const [langOpen, setLangOpen] = useState(false);

  const changeLang = (code: LangCode) => {
    window.localStorage.setItem("igseek:lang", code);
    syncDocumentLang(code);
    window.dispatchEvent(new Event("igseek:lang-change"));
    setLangOpen(false);
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setLangOpen((v) => !v)}
            onBlur={() => setTimeout(() => setLangOpen(false), 120)}
            className="glass-button flex h-9 px-2.5 items-center gap-1 rounded-xl text-xs font-medium text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
            title={t("Language")}
            aria-label={t("Change language")}
          >
            <span>文A</span>
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>
          {langOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-40 rounded-2xl border border-border bg-surface p-1 shadow-xl z-50">
              {LOGIN_LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    changeLang(l.code);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs rounded-xl transition-colors cursor-pointer ${
                    lang === l.code
                      ? "bg-foreground/10 font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                  }`}
                >
                  <span>{l.native}</span>
                  {lang === l.code && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          className="glass-button flex h-9 w-9 items-center justify-center rounded-xl text-foreground hover:bg-foreground/5 transition-colors cursor-pointer"
          title={theme === "dark" ? t("Switch to light") : t("Switch to dark")}
          aria-label={t("Toggle theme")}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {isMobileBridge ? (
        <MobileGoogleAuthBridge oauthState={state} redirectUri={redirect_uri} />
      ) : (
        <AuthCard
          onSuccess={() => {
            void navigate({ to: safeNext as any, replace: true });
          }}
        />
      )}
    </div>
  );
}
