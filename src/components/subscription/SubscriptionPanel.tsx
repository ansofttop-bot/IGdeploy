import { useEffect, useState } from "react";
import {
  Check,
  CreditCard,
  Crown,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  getStoredPendingTxnId,
  startPlategaCheckout,
  verifyPlategaPayment,
  type ClientSubscriptionState,
  type PaymentMethodChoice,
} from "@/lib/subscription-client";
import { localeFor, type LangCode } from "@/lib/i18n";

/**
 * Subscription settings tab rendered inside ProfileModal ("Subscription" tab).
 * Displays Free vs Pro tier capabilities (without exposing underlying AI vendor names),
 * handles Platega SBP/Card checkout initiation, and polls `/api/subscription` automatically
 * while a payment is pending confirmation.
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

export function SubscriptionPanel({
  uid,
  email,
  isGuest,
  lang,
  t,
  subscription,
  getToken,
  onSubscriptionChange,
  onRequestAuth,
}: SubscriptionPanelProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodChoice>(2);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [activePaymentUrl, setActivePaymentUrl] = useState<string | null>(null);
  const [pendingTxnId, setPendingTxnId] = useState<string | null>(
    () => subscription.pendingTxnId || getStoredPendingTxnId(uid),
  );

  useEffect(() => {
    const nextPending = subscription.pendingTxnId || getStoredPendingTxnId(uid);
    setPendingTxnId(nextPending);
  }, [subscription.pendingTxnId, uid]);

  // Automatic background polling while there is an unconfirmed payment
  useEffect(() => {
    if (!pendingTxnId || isGuest) return;
    let stopped = false;

    const checkOnce = async () => {
      if (stopped) return;
      try {
        const token = await getToken();
        if (!token || stopped) return;
        const result = await verifyPlategaPayment(token, pendingTxnId, uid);
        if (stopped) return;
        onSubscriptionChange(result.subscription);
        if (result.verified) {
          setPendingTxnId(null);
          setActivePaymentUrl(null);
          toast.success(t("IGseek Pro activated for 30 days!"));
        } else if (result.paymentStatus === "CANCELED" || result.paymentStatus === "CHARGEBACKED") {
          setPendingTxnId(null);
        }
      } catch {
        // silent retry on next tick
      }
    };

    const interval = window.setInterval(() => {
      void checkOnce();
    }, 5000);

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [pendingTxnId, isGuest, uid, getToken, onSubscriptionChange, t]);

  const handleCheckout = async () => {
    if (isGuest) {
      onRequestAuth?.();
      return;
    }
    if (creatingPayment) return;
    setCreatingPayment(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error(t("Sign in to purchase IGseek Pro"));
        onRequestAuth?.();
        return;
      }
      const res = await startPlategaCheckout(token, {
        uid,
        email,
        paymentMethod,
      });
      setPendingTxnId(res.transactionId);
      setActivePaymentUrl(res.paymentUrl);
      toast.info(t("Redirecting to checkout…"));
      window.location.assign(res.paymentUrl);
    } catch (err: any) {
      toast.error(err?.message || t("Failed to start payment"));
    } finally {
      setCreatingPayment(false);
    }
  };

  const handleManualVerify = async () => {
    if (verifying || isGuest) return;
    setVerifying(true);
    try {
      const token = await getToken();
      if (!token) {
        toast.error(t("Sign in to verify payment"));
        return;
      }
      const result = await verifyPlategaPayment(token, pendingTxnId, uid);
      onSubscriptionChange(result.subscription);
      if (result.verified) {
        setPendingTxnId(null);
        setActivePaymentUrl(null);
        toast.success(t("Payment confirmed — IGseek Pro is active!"));
      } else {
        toast.info(result.message || t("Payment is still processing"));
      }
    } catch (err: any) {
      toast.error(err?.message || t("Verification failed"));
    } finally {
      setVerifying(false);
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
              <Crown className={`h-4 w-4 ${subscription.isPro ? "text-brand" : "text-muted-foreground"}`} />
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
            <div className="text-base font-bold text-foreground tabular-nums">149 ₽</div>
            <div className="text-[10px] text-muted-foreground">/ {t("month")}</div>
          </div>
        </div>

        {subscription.isPro && subscription.lastTxnId && (
          <div className="flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("Automatic 30-day tracking active")}
            </span>
            <span className="font-mono text-[10px] opacity-80 truncate max-w-[140px]">
              #{subscription.lastTxnId.slice(0, 12)}
            </span>
          </div>
        )}
      </div>

      {/* Pending Payment Auto-Verification Banner */}
      {pendingTxnId && !isGuest && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500 shrink-0" />
              <span>{t("Waiting for payment confirmation…")}</span>
            </div>
            <button
              type="button"
              disabled={verifying}
              onClick={() => void handleManualVerify()}
              className="glass-button inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium text-foreground cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${verifying ? "animate-spin" : ""}`} />
              {t("Check status")}
            </button>
          </div>
          {activePaymentUrl && (
            <a
              href={activePaymentUrl}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {t("Open payment page again")}
            </a>
          )}
        </div>
      )}

      {/* Plan Comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-border/70 bg-surface-elevated/30 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{t("Free")}</span>
            <span className="text-[11px] font-mono text-muted-foreground">0 ₽</span>
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
            <span className="text-[11px] font-mono font-semibold text-brand">149 ₽ / {t("mo")}</span>
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

      {/* Payment Method & Checkout CTA */}
      <div className="rounded-xl border border-border/80 bg-surface-elevated/40 p-3.5 space-y-3">
        <div className="text-[11px] font-medium text-muted-foreground">
          {t("Payment method")}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod(2)}
            className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 px-3 text-xs font-medium transition-all cursor-pointer ${
              paymentMethod === 2
                ? "border-brand bg-brand/15 text-brand shadow-sm"
                : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground"
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
                : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            {t("Bank card")}
          </button>
        </div>

        <button
          type="button"
          disabled={creatingPayment}
          onClick={() => void handleCheckout()}
          className="w-full rounded-xl bg-[var(--brand)] hover:brightness-110 text-white py-2.5 px-4 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 shadow-sm"
        >
          {creatingPayment ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("Creating payment…")}
            </>
          ) : isGuest ? (
            t("Sign in to upgrade to Pro")
          ) : subscription.isPro ? (
            t("Extend Pro for 30 days — 149 ₽")
          ) : (
            t("Subscribe to Pro — 149 ₽/mo")
          )}
        </button>

        <p className="text-[10px] text-center text-muted-foreground leading-relaxed">
          {t("Payment is verified automatically right after checkout. Subscription lasts 30 days with no hidden auto-charges.")}
        </p>
      </div>
    </div>
  );
}
