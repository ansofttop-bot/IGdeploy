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

function buildAndroidAuthDeepLink(params: {
  firebaseIdToken: string;
  refreshToken: string;
  uid: string;
  email: string;
  name: string;
  state: string;
}): string {
  const hash = new URLSearchParams({
    firebase_id_token: params.firebaseIdToken,
    refresh_token: params.refreshToken,
    uid: params.uid,
    email: params.email,
    name: params.name,
    ...(params.state ? { state: params.state } : {}),
  }).toString();
  return `app.igseek.mobile://auth#${hash}`;
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
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "",
    mobile_auth: typeof s.mobile_auth === "string" ? s.mobile_auth : "",
    state: typeof s.state === "string" ? s.state : "",
  }),
  beforeLoad: async ({ search }) => {
    if (search.mobile_auth === "1") return;
    const { data } = await firebaseClient.auth.getSession();
    if (data.session) {
      const target = isSafeNext(search.next) ? search.next : "/app";
      throw redirect({ to: target as any, replace: true });
    }
  },
  component: LoginPage,
});

function MobileGoogleAuthBridge({ oauthState }: { oauthState: string }) {
  const t = useT();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const handoffUser = async (user: NonNullable<typeof auth.currentUser>) => {
    const idToken = await user.getIdToken(true);
    const refreshToken = (user as any).refreshToken || "";
    const email = user.email || "";
    const name = user.displayName || email.split("@")[0] || "User";
    const link = buildAndroidAuthDeepLink({
      firebaseIdToken: idToken,
      refreshToken,
      uid: user.uid,
      email,
      name,
      state: oauthState,
    });
    setSignedInEmail(email || name);
    setDeepLink(link);
    setBusy(false);
    window.location.href = link;
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const redirectRes = await getRedirectResult(auth).catch(() => null);
        if (!active) return;
        const user = redirectRes?.user || auth.currentUser;
        if (user) {
          await handoffUser(user);
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
    try {
      if (forceAccountPicker && auth.currentUser) {
        await signOut(auth).catch(() => {});
        setDeepLink(null);
        setSignedInEmail(null);
      }
      googleProvider.setCustomParameters({ prompt: "select_account" });
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        await handoffUser(cred.user);
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
  const { next, mobile_auth, state } = Route.useSearch();
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

      {mobile_auth === "1" ? (
        <MobileGoogleAuthBridge oauthState={state} />
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
