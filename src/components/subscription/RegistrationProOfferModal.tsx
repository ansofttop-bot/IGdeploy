import { useState, type FormEvent } from "react";
import { motion } from "motion/react";
import { AlertCircle, Check, Crown, KeyRound, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  redeemLicenseKey,
  type ClientSubscriptionState,
} from "@/lib/subscription-client";

/**
 * Post-registration Pro offer modal shown once right after signup.
 * Allows instant activation via a one-time IGseek Pro license key or continuing on Free.
 */
interface RegistrationProOfferModalProps {
  uid: string;
  email?: string;
  t: (key: string) => string;
  getToken: () => Promise<string>;
  onDismiss: () => void;
  onSubscriptionChange?: (next: ClientSubscriptionState) => void;
}

export function RegistrationProOfferModal({
  uid,
  t,
  getToken,
  onDismiss,
  onSubscriptionChange,
}: RegistrationProOfferModalProps) {
  const [licenseKey, setLicenseKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleActivate = async (e?: FormEvent) => {
    e?.preventDefault();
    if (loading) return;
    const clean = licenseKey.trim();
    if (!clean) {
      setErrorText("Введите ключ формата IGSK-XXXX-XXXX-XXXX.");
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const token = await getToken();
      if (!token) {
        const msg = "Войдите в аккаунт IGseek, чтобы активировать ключ Pro.";
        setErrorText(msg);
        toast.error(msg);
        setLoading(false);
        return;
      }
      const res = await redeemLicenseKey(token, clean, uid);
      onSubscriptionChange?.(res.subscription);
      toast.success("Ключ активирован — IGseek Pro подключён на 30 дней!");
      onDismiss();
    } catch (err: any) {
      const msg = err?.message || "Не удалось активировать ключ.";
      setErrorText(msg);
      toast.error(msg);
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-background/80 backdrop-blur-md p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="glass-card relative w-full max-w-md rounded-2xl border border-white/15 bg-surface/95 p-6 backdrop-blur-2xl shadow-[0_24px_70px_rgba(0,0,0,0.65)] my-auto space-y-5"
      >
        <button
          type="button"
          onClick={onDismiss}
          className="glass-button absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label={t("Close")}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-2 pr-8">
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-brand/15 px-2.5 py-1 text-[11px] font-semibold text-brand">
            <Crown className="h-3.5 w-3.5" />
            IGseek Pro
          </div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            {t("Unlock full power with Pro")}
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Есть ключ активации IGseek Pro? Введите его ниже, чтобы мгновенно открыть продвинутые модели и генерацию изображений на 30 дней.
          </p>
        </div>

        <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-foreground">{t("IGseek Pro · 30 days")}</span>
            <span className="text-xs font-mono font-semibold text-brand">
              1 key = 30d
            </span>
          </div>
          <ul className="space-y-1.5 text-xs text-foreground/90">
            {[
              t("Unlimited Photos, Flow, Engine & Cloud Memory"),
              t("Exclusive Deep Reasoning mode & flagship AI models"),
              t("Reference photo editing & Studio image generation"),
              t("Flow Autopilot mode — no auto-charges"),
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check className="h-3.5 w-3.5 text-brand shrink-0 mt-0.5" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={(e) => void handleActivate(e)} className="space-y-3">
          <div className="space-y-2">
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => {
                  setLicenseKey(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9-]/g, "")
                      .slice(0, 24),
                  );
                  if (errorText) setErrorText(null);
                }}
                placeholder="IGSK-XXXX-XXXX-XXXX"
                autoComplete="off"
                spellCheck={false}
                disabled={loading}
                className="w-full rounded-xl border border-border/80 bg-surface-elevated/60 pl-9 pr-3.5 py-2.5 text-xs font-mono tracking-wider text-foreground placeholder:text-muted-foreground/60 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 transition-all"
              />
            </div>
            {errorText && (
              <div className="flex items-start gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-500 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{errorText}</span>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-0.5">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[var(--brand)] hover:brightness-110 text-white py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Активация ключа…
                </>
              ) : (
                "Активировать ключ Pro"
              )}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="w-full rounded-xl border border-border/70 bg-transparent hover:bg-surface-elevated/60 text-muted-foreground hover:text-foreground py-2 px-4 text-xs font-medium transition-colors cursor-pointer"
            >
              {t("Continue on Free plan")}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
