import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  Check,
  Crown,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  redeemLicenseKey,
  type ClientSubscriptionState,
} from "@/lib/subscription-client";
import { localeFor, type LangCode } from "@/lib/i18n";

/**
 * Subscription settings tab rendered inside ProfileModal ("Subscription" tab).
 * Displays Free vs Pro tier capabilities and provides one-time license key activation
 * (each valid key grants 30 days of IGseek Pro and is permanently burned upon use).
 */
interface SubscriptionPanelProps {
  uid: string;
  email?: string;
  isGuest: boolean;
  lang: LangCode;
  t: (key: string) => string;
  subscription: ClientSubscriptionState;
  getToken: () => Promise<string>;
  onSubscriptionChange: (next: ClientSubscriptionState) => void;
  onRequestAuth?: () => void;
}

function formatKeyInput(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 24);
}

export function SubscriptionPanel({
  uid,
  isGuest,
  lang,
  t,
  subscription,
  getToken,
  onSubscriptionChange,
  onRequestAuth,
}: SubscriptionPanelProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [activating, setActivating] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const isRu = lang === "ru";

  const handleRedeem = async (e?: FormEvent) => {
    e?.preventDefault();
    setErrorText(null);
    if (isGuest) {
      onRequestAuth?.();
      return;
    }
    const clean = licenseKey.trim();
    if (!clean) {
      setErrorText(
        isRu
          ? "Введите ключ активации формата IGSK-XXXX-XXXX-XXXX."
          : "Enter a license key in format IGSK-XXXX-XXXX-XXXX.",
      );
      return;
    }
    if (activating) return;
    setActivating(true);
    try {
      const token = await getToken();
      if (!token) {
        const msg = isRu
          ? "Войдите в аккаунт IGseek (через Google), чтобы активировать ключ Pro."
          : "Sign in to your IGseek account to activate a Pro key.";
        setErrorText(msg);
        toast.error(msg);
        onRequestAuth?.();
        return;
      }
      const res = await redeemLicenseKey(token, clean, uid);
      onSubscriptionChange(res.subscription);
      setLicenseKey("");
      setErrorText(null);
      toast.success(
        isRu
          ? "Ключ активирован — IGseek Pro подключён на 30 дней!"
          : "Key redeemed — IGseek Pro is active for 30 days!",
      );
    } catch (err: any) {
      const msg =
        err?.message ||
        (isRu ? "Не удалось активировать ключ." : "Failed to activate license key.");
      setErrorText(msg);
      toast.error(msg);
    } finally {
      setActivating(false);
    }
  };

  const formattedExpiry = subscription.expiresAt
    ? new Date(subscription.expiresAt).toLocaleDateString(localeFor(lang), {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="space-y-4">
      {/* Current Plan Status Card */}
      <div
        className={`rounded-2xl border p-4 space-y-3 ${
          subscription.isPro
            ? "border-brand/40 bg-brand/10"
            : "border-border/80 bg-surface-elevated/40"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Crown
                className={`h-4 w-4 ${subscription.isPro ? "text-brand" : "text-muted-foreground"}`}
              />
              <span className="text-sm font-semibold text-foreground">
                {subscription.isPro ? "IGseek Pro" : t("Free plan")}
              </span>
              {subscription.isPro && (
                <span className="rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {t("Active plan")}
                </span>
              )}
              {!subscription.isPro && subscription.status === "expired" && (
                <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  {t("Expired")}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {subscription.isPro
                ? `${t("Valid until")} ${formattedExpiry || "—"} · ${subscription.daysLeft} ${t("d. left")}`
                : t("Unlimited Chat, Engine, Flow & Photos on standard models.")}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-bold text-foreground">
              {isRu ? "30 дней" : "30 days"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {isRu ? "по ключу" : "by key"}
            </div>
          </div>
        </div>

        {subscription.isPro && subscription.lastKeyId && (
          <div className="flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("Automatic 30-day tracking active")}
            </span>
            <span className="font-mono text-[10px] opacity-80 truncate max-w-[140px]">
              #{subscription.lastKeyId.slice(0, 14)}
            </span>
          </div>
        )}
      </div>

      {/* Plan Comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-border/70 bg-surface-elevated/30 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{t("Free")}</span>
            <span className="text-[11px] font-mono text-muted-foreground">
              {isRu ? "Базовый" : "Base"}
            </span>
          </div>
          <ul className="space-y-1.5 text-[11px] text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span>{t("Unlimited Chat, Engine & Flow on standard models")}</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span>{t("All tools, attachments, web search & Library included")}</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <span>{t("Standard image generation without daily caps")}</span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-brand/45 bg-brand/5 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-brand" />
              Pro
            </span>
            <span className="text-[11px] font-mono font-semibold text-brand">
              {isRu ? "30 дней" : "30 days"}
            </span>
          </div>
          <ul className="space-y-1.5 text-[11px] text-foreground/90">
            <li className="flex items-start gap-1.5">
              <Check className="h-3.5 w-3.5 text-brand shrink-0 mt-0.5" />
              <span>{t("More advanced models & deep reasoning across all tabs")}</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="h-3.5 w-3.5 text-brand shrink-0 mt-0.5" />
              <span>{t("Higher accuracy for complex coding, Engine & Flow")}</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="h-3.5 w-3.5 text-brand shrink-0 mt-0.5" />
              <span>{t("High-quality image generation & reference photo editing")}</span>
            </li>
          </ul>
        </div>
      </div>

      {/* License Key Redemption Form */}
      <form
        onSubmit={(e) => void handleRedeem(e)}
        className="rounded-xl border border-border/80 bg-surface-elevated/40 p-3.5 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <KeyRound className="h-3.5 w-3.5 text-brand" />
            <span>
              {subscription.isPro
                ? isRu
                  ? "Продлить подписку ключом (+30 дней)"
                  : "Extend Pro with a key (+30 days)"
                : isRu
                  ? "Активация подписки по ключу"
                  : "Activate Pro with a license key"}
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            {isRu ? "1 ключ = 1 мес." : "1 key = 30d"}
          </span>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            value={licenseKey}
            onChange={(e) => {
              setLicenseKey(formatKeyInput(e.target.value));
              if (errorText) setErrorText(null);
            }}
            placeholder="IGSK-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            disabled={activating}
            className="w-full rounded-xl border border-border/80 bg-background/80 px-3.5 py-2.5 text-xs font-mono tracking-wider text-foreground placeholder:text-muted-foreground/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all"
          />

          {errorText && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-500 dark:text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{errorText}</span>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={activating}
          className="w-full rounded-xl bg-[var(--brand)] hover:brightness-110 text-white py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 shadow-sm"
        >
          {activating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isRu ? "Активация ключа…" : "Activating key…"}
            </>
          ) : isGuest ? (
            isRu ? "Войти для активации ключа" : "Sign in to activate key"
          ) : subscription.isPro ? (
            isRu ? "Продлить IGseek Pro на 30 дней" : "Extend IGseek Pro by 30 days"
          ) : (
            isRu ? "Активировать ключ" : "Activate key"
          )}
        </button>

        <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
          {isRu
            ? "Каждый ключ одноразовый: после активации подписка действует 30 дней без автосписаний, а ключ становится недействительным."
            : "Each key is single-use: once activated, Pro runs for 30 days with no auto-charges and the key is permanently consumed."}
        </p>
      </form>
    </div>
  );
}
