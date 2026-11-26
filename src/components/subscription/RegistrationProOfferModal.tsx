import { useState } from "react";
import { motion } from "motion/react";
import { Check, CreditCard, Crown, Loader2, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import {
  startPlategaCheckout,
  type PaymentMethodChoice,
} from "@/lib/subscription-client";

/**
 * Post-registration Pro offer modal shown once right after email or Google signup.
 * Presents tier-level benefits (without exposing underlying AI vendor names) and
 * allows either instant checkout or continuing on the Free plan.
 */
interface RegistrationProOfferModalProps {
  uid: string;
  email?: string;
  t: (key: string) => string;
  getToken: () => Promise<string>;
  onDismiss: () => void;
  onPaymentStarted?: (txnId: string) => void;
}

export function RegistrationProOfferModal({
  uid,
  email,
  t,
  getToken,
  onDismiss,
  onPaymentStarted,
}: RegistrationProOfferModalProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodChoice>(2);
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error(t("Sign in to purchase IGseek Pro"));
        setLoading(false);
        return;
      }
      const res = await startPlategaCheckout(token, {
        uid,
        email,
        paymentMethod,
      });
      onPaymentStarted?.(res.transactionId);
      toast.info(t("Redirecting to checkout…"));
      window.location.assign(res.paymentUrl);
    } catch (err: any) {
      toast.error(err?.message || t("Failed to start payment"));
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
            {t("Upgrade to more advanced AI models, deep reasoning, and high-quality image generation & editing for 149 ₽/month.")}
          </p>
        </div>

        <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-foreground">{t("IGseek Pro · 30 days")}</span>
            <span className="text-lg font-bold text-foreground tabular-nums">
              149 ₽ <span className="text-[11px] font-normal text-muted-foreground">/ {t("mo")}</span>
            </span>
          </div>
          <ul className="space-y-1.5 text-xs text-foreground/90">
            {[
              t("More advanced models & deep reasoning across all tabs"),
              t("Higher accuracy for complex coding, Engine & Flow"),
              t("High-quality image generation & reference photo editing"),
              t("Automatic 30-day tracking, no hidden renewals"),
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <Check className="h-3.5 w-3.5 text-brand shrink-0 mt-0.5" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod(2)}
            className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 px-3 text-xs font-medium transition-all cursor-pointer ${
              paymentMethod === 2
                ? "border-brand bg-brand/15 text-brand shadow-sm"
                : "border-border/70 bg-surface-elevated/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            <QrCode className="h-3.5 w-3.5" />
            {t("SBP / QR")}
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod(11)}
            className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 px-3 text-xs font-medium transition-all cursor-pointer ${
              paymentMethod === 11
                ? "border-brand bg-brand/15 text-brand shadow-sm"
                : "border-border/70 bg-surface-elevated/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            {t("Bank card")}
          </button>
        </div>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleUpgrade()}
            className="w-full rounded-xl bg-[var(--brand)] hover:brightness-110 text-white py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 shadow-sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("Creating payment…")}
              </>
            ) : (
              t("Subscribe to Pro — 149 ₽/mo")
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
      </motion.div>
    </motion.div>
  );
}
