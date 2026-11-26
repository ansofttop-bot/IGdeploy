import { setUserProStatus } from "./prompt-limits";

export interface ClientSubscriptionState {
  plan: "free" | "pro";
  isPro: boolean;
  status: "active" | "expired" | "free";
  startedAt: string | null;
  expiresAt: string | null;
  daysLeft: number;
  lastKeyId: string | null;
  durationDays: number;
}

export const DEFAULT_FREE_SUBSCRIPTION: ClientSubscriptionState = {
  plan: "free",
  isPro: false,
  status: "free",
  startedAt: null,
  expiresAt: null,
  daysLeft: 0,
  lastKeyId: null,
  durationDays: 30,
};

const REG_OFFER_SHOWN_PREFIX = "igseek:pro_reg_offer_shown:";

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
    // ignore storage errors
  }
}

export async function fetchSubscriptionStatus(
  token: string,
  uid?: string | null,
): Promise<ClientSubscriptionState> {
  const res = await fetch("/api/subscription", {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Subscription status error (${res.status})`);
  }
  const data = (await res.json()) as ClientSubscriptionState;
  if (uid) {
    setUserProStatus(uid, Boolean(data.isPro));
  }
  return data;
}

export async function redeemLicenseKey(
  token: string,
  key: string,
  uid?: string | null,
): Promise<{
  redeemed: boolean;
  subscription: ClientSubscriptionState;
}> {
  const res = await fetch("/api/subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "redeem",
      key: key.trim(),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    throw new Error(data.error || `Не удалось активировать ключ (${res.status})`);
  }
  const sub = (data.subscription || DEFAULT_FREE_SUBSCRIPTION) as ClientSubscriptionState;
  if (uid) {
    setUserProStatus(uid, Boolean(sub.isPro));
  }
  return {
    redeemed: Boolean(data.redeemed),
    subscription: sub,
  };
}
