import { setUserProStatus } from "./prompt-limits";

export type PaymentMethodChoice = 2 | 11;

export interface ClientSubscriptionState {
  plan: "free" | "pro";
  isPro: boolean;
  status: "active" | "expired" | "pending" | "free";
  startedAt: string | null;
  expiresAt: string | null;
  daysLeft: number;
  lastTxnId: string | null;
  pendingTxnId: string | null;
  priceRub: number;
  durationDays: number;
  paymentConfigured?: boolean;
}

export const DEFAULT_FREE_SUBSCRIPTION: ClientSubscriptionState = {
  plan: "free",
  isPro: false,
  status: "free",
  startedAt: null,
  expiresAt: null,
  daysLeft: 0,
  lastTxnId: null,
  pendingTxnId: null,
  priceRub: 149,
  durationDays: 30,
};

const PENDING_TXN_PREFIX = "igseek:pending_platega_txn:";
const REG_OFFER_SHOWN_PREFIX = "igseek:pro_reg_offer_shown:";

export function getStoredPendingTxnId(uid: string | null | undefined): string | null {
  if (!uid || typeof window === "undefined") return null;
  try {
    const val = window.localStorage.getItem(`${PENDING_TXN_PREFIX}${uid}`);
    return val && val.trim() ? val.trim() : null;
  } catch {
    return null;
  }
}

export function setStoredPendingTxnId(uid: string | null | undefined, txnId: string | null): void {
  if (!uid || typeof window === "undefined") return;
  try {
    if (txnId && txnId.trim()) {
      window.localStorage.setItem(`${PENDING_TXN_PREFIX}${uid}`, txnId.trim());
    } else {
      window.localStorage.removeItem(`${PENDING_TXN_PREFIX}${uid}`);
    }
  } catch {
    // ignore storage errors
  }
}

export function hasSeenRegistrationProOffer(uid: string | null | undefined): boolean {
  if (!uid || typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(`${REG_OFFER_SHOWN_PREFIX}${uid}`) === "1";
  } catch {
    return false;
  }
}

export function markRegistrationProOfferSeen(uid: string | null | undefined): void {
  if (!uid || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${REG_OFFER_SHOWN_PREFIX}${uid}`, "1");
  } catch {
    // ignore
  }
}

export function isSafePlategaRedirect(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === "platega.io" ||
      host.endsWith(".platega.io") ||
      host.endsWith(".nspk.ru") ||
      host === "qr.nspk.ru"
    );
  } catch {
    return false;
  }
}

export async function fetchSubscriptionStatus(
  token: string,
  uid?: string | null,
): Promise<ClientSubscriptionState> {
  const pendingTxnId = getStoredPendingTxnId(uid);
  const qs = pendingTxnId ? `?txnId=${encodeURIComponent(pendingTxnId)}` : "";
  const res = await fetch(`/api/subscription${qs}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Subscription status error (${res.status})`);
  }
  const data = (await res.json()) as ClientSubscriptionState;
  if (uid) {
    setUserProStatus(uid, Boolean(data.isPro));
    if (data.isPro || !data.pendingTxnId) {
      setStoredPendingTxnId(uid, null);
    } else if (data.pendingTxnId) {
      setStoredPendingTxnId(uid, data.pendingTxnId);
    }
  }
  return data;
}

export async function startPlategaCheckout(
  token: string,
  options: {
    uid: string;
    email?: string;
    paymentMethod: PaymentMethodChoice;
  },
): Promise<{ transactionId: string; paymentUrl: string; amount: number; currency: string }> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const returnUrl = `${origin}/app`;
  const failedUrl = `${origin}/app`;

  const fiveMinBucket = Math.floor(Date.now() / (5 * 60_000));
  const idempotencyKey = `web_${options.uid.slice(0, 12)}_m${options.paymentMethod}_b${fiveMinBucket}`;

  const res = await fetch("/api/create-payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      paymentMethod: options.paymentMethod,
      email: options.email,
      returnUrl,
      failedUrl,
      idempotencyKey,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    throw new Error(data.error || `Не удалось создать платёж (${res.status})`);
  }
  const transactionId = String(data.transactionId || "").trim();
  const paymentUrl = String(data.paymentUrl || "").trim();
  if (!transactionId || !paymentUrl || !isSafePlategaRedirect(paymentUrl)) {
    throw new Error("Получена некорректная ссылка на оплату Platega.");
  }

  setStoredPendingTxnId(options.uid, transactionId);

  return {
    transactionId,
    paymentUrl,
    amount: Number(data.amount || 149),
    currency: String(data.currency || "RUB"),
  };
}

export async function verifyPlategaPayment(
  token: string,
  transactionId: string | null,
  uid?: string | null,
): Promise<{
  verified: boolean;
  paymentStatus: string;
  subscription: ClientSubscriptionState;
  message?: string;
}> {
  const res = await fetch("/api/subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "verify",
      transactionId: transactionId || undefined,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(data.error || `Ошибка проверки платежа (${res.status})`);
  }
  const sub = (data.subscription || DEFAULT_FREE_SUBSCRIPTION) as ClientSubscriptionState;
  if (uid) {
    setUserProStatus(uid, Boolean(sub.isPro));
    if (data.verified || data.paymentStatus === "CONFIRMED" || data.paymentStatus === "CANCELED") {
      setStoredPendingTxnId(uid, null);
    }
  }
  return {
    verified: Boolean(data.verified),
    paymentStatus: String(data.paymentStatus || "UNKNOWN"),
    subscription: sub,
    message: data.message,
  };
}
