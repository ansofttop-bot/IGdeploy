import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import firebaseConfig from "../../firebase-applet-config.json";
import { getWritableDataDir } from "./server-data-dir";
import type { AuthedUser } from "./memory-server";

export const PRO_PRICE_RUB = 149;
export const PRO_CURRENCY = "RUB";
export const PRO_DURATION_DAYS = 30;
export const PRO_DURATION_MS = PRO_DURATION_DAYS * 24 * 60 * 60 * 1000;

const PLATEGA_API_BASE = "https://app.platega.io";
const CONFIRMED_STORE_FILE = path.join(getWritableDataDir(), "platega-confirmed.json");

const PROJECT_ID = (
  process.env.FIREBASE_PROJECT_ID ||
  process.env.VITE_FIREBASE_PROJECT_ID ||
  (firebaseConfig as any).projectId ||
  ""
).trim();
const DATABASE_ID =
  (
    process.env.FIREBASE_DATABASE_ID ||
    process.env.VITE_FIREBASE_DATABASE_ID ||
    (firebaseConfig as any).firestoreDatabaseId ||
    "(default)"
  ).trim() || "(default)";
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${encodeURIComponent(DATABASE_ID)}/documents`;

export type PlategaStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELED"
  | "CHARGEBACKED"
  | "DISPUTED"
  | "PARTIALLY_REFUNDED"
  | "UNKNOWN";

export interface SubscriptionState {
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
}

interface SignedProofPayload {
  uid: string;
  plan: "pro";
  txnId: string;
  startedAt: number;
  expiresAt: number;
}

interface ConfirmedWebhookRecord {
  txnId: string;
  uid: string | null;
  amount: number;
  currency: string;
  status: PlategaStatus;
  confirmedAt: string;
}

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString("hex");
const TIER_CACHE = new Map<string, { isPro: boolean; expiresAtMs: number; checkedAt: number }>();
const TIER_CACHE_TTL_MS = 45_000;

function getPlategaConfig(): { merchantId: string; secretKey: string } {
  const merchantId = (process.env.PLATEGA_MERCHANT_ID || "").trim();
  const secretKey = (process.env.PLATEGA_SECRET_KEY || "").trim();
  return { merchantId, secretKey };
}

export function isPlategaConfigured(): boolean {
  const { merchantId, secretKey } = getPlategaConfig();
  return Boolean(merchantId && secretKey);
}

function getSigningSecret(): string {
  const explicit = (process.env.SUBSCRIPTION_SIGNING_SECRET || "").trim();
  if (explicit) return explicit;
  const platega = (process.env.PLATEGA_SECRET_KEY || "").trim();
  if (platega) return `igseek-pro-hmac:${platega}`;
  return EPHEMERAL_FALLBACK_SECRET;
}

export function signSubscriptionProof(payload: SignedProofPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySubscriptionProof(
  token: string | null | undefined,
  expectedUid: string,
): SignedProofPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac("sha256", getSigningSecret())
    .update(encoded)
    .digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as SignedProofPayload;
    if (
      !parsed ||
      parsed.plan !== "pro" ||
      parsed.uid !== expectedUid ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.startedAt !== "number" ||
      !parsed.txnId
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function safeTimingEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyPlategaWebhookAuth(headers: {
  get(name: string): string | null;
}): boolean {
  const { merchantId, secretKey } = getPlategaConfig();
  if (!merchantId || !secretKey) return false;
  const reqMerchant = (headers.get("x-merchantid") || headers.get("X-MerchantId") || "").trim();
  const reqSecret = (headers.get("x-secret") || headers.get("X-Secret") || "").trim();
  if (!reqMerchant || !reqSecret) return false;
  return safeTimingEqual(reqMerchant, merchantId) && safeTimingEqual(reqSecret, secretKey);
}

export function isAllowedPaymentUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
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

export function sanitizeReturnUrl(rawUrl: string | undefined, fallbackOrigin: string): string {
  try {
    if (rawUrl) {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.toString();
      }
    }
  } catch {
    // ignore invalid custom return url
  }
  return `${fallbackOrigin.replace(/\/$/, "")}/app`;
}

export async function createPlategaTransaction(params: {
  uid: string;
  email?: string;
  paymentMethod: 2 | 11;
  returnUrl: string;
  failedUrl: string;
}): Promise<{ transactionId: string; paymentUrl: string; status: PlategaStatus }> {
  const { merchantId, secretKey } = getPlategaConfig();
  if (!merchantId || !secretKey) {
    throw new Error("Platega payment gateway is not configured on the server.");
  }

  const orderNonce = crypto.randomBytes(8).toString("hex");
  const payloadStr = JSON.stringify({
    uid: params.uid,
    plan: "pro",
    orderId: `igpro_${Date.now()}_${orderNonce}`,
  });

  const requestBody = {
    paymentMethod: params.paymentMethod,
    paymentDetails: {
      amount: PRO_PRICE_RUB,
      currency: PRO_CURRENCY,
    },
    description: `IGseek Pro (30 дней)${params.email ? ` — ${params.email.slice(0, 64)}` : ""}`,
    return: params.returnUrl,
    failedUrl: params.failedUrl,
    payload: payloadStr,
  };

  const endpoints = [
    `${PLATEGA_API_BASE}/transaction/process`,
    `${PLATEGA_API_BASE}/v2/transaction/process`,
  ];

  let lastErr = "";
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MerchantId": merchantId,
          "X-Secret": secretKey,
        },
        body: JSON.stringify(requestBody),
      });
      const text = await res.text();
      if (!res.ok) {
        lastErr = `Platega ${res.status}: ${text.slice(0, 240)}`;
        if (res.status === 404) continue;
        throw new Error(lastErr);
      }
      const data = JSON.parse(text) as Record<string, any>;
      const transactionId = String(
        data.transactionId || data.id || data.transaction?.id || "",
      ).trim();
      const paymentUrl = String(
        data.redirect || data.url || data.paymentUrl || data.transaction?.redirect || "",
      ).trim();
      const status = normalizePlategaStatus(data.status || "PENDING");

      if (!transactionId || !paymentUrl) {
        throw new Error("Platega response missing transactionId or redirect URL.");
      }
      if (!isAllowedPaymentUrl(paymentUrl)) {
        throw new Error("Unexpected payment redirect domain returned by payment gateway.");
      }
      return { transactionId, paymentUrl, status };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      if (!lastErr.includes("404")) break;
    }
  }

  throw new Error(lastErr || "Failed to initialize Platega payment.");
}

export function normalizePlategaStatus(raw: unknown): PlategaStatus {
  const upper = String(raw || "").trim().toUpperCase();
  if (
    upper === "PENDING" ||
    upper === "CONFIRMED" ||
    upper === "CANCELED" ||
    upper === "CHARGEBACKED" ||
    upper === "DISPUTED" ||
    upper === "PARTIALLY_REFUNDED"
  ) {
    return upper;
  }
  if (upper === "PAID" || upper === "SUCCESS" || upper === "COMPLETED") return "CONFIRMED";
  if (upper === "CANCELLED" || upper === "FAILED" || upper === "EXPIRED") return "CANCELED";
  return "UNKNOWN";
}

export interface PlategaTransactionInfo {
  transactionId: string;
  status: PlategaStatus;
  amount: number;
  currency: string;
  payloadUid: string | null;
  rawPayload: string | null;
}

export function extractUidFromPayload(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === "object" && payload !== null) {
    const uid = (payload as Record<string, unknown>).uid;
    return typeof uid === "string" && uid.trim() ? uid.trim() : null;
  }
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.uid === "string" && parsed.uid.trim()) {
        return parsed.uid.trim();
      }
    } catch {
      // allow plain uid string fallback
      if (/^[a-zA-Z0-9_-]{8,128}$/.test(trimmed)) return trimmed;
    }
  }
  return null;
}

export async function getPlategaTransactionStatus(
  transactionId: string,
): Promise<PlategaTransactionInfo> {
  const cleanId = String(transactionId || "").trim();
  if (!cleanId || !/^[a-zA-Z0-9_-]{4,128}$/.test(cleanId)) {
    throw new Error("Invalid transaction ID format.");
  }
  const { merchantId, secretKey } = getPlategaConfig();
  if (!merchantId || !secretKey) {
    throw new Error("Platega payment gateway is not configured on the server.");
  }

  const res = await fetch(`${PLATEGA_API_BASE}/transaction/${encodeURIComponent(cleanId)}`, {
    method: "GET",
    headers: {
      "X-MerchantId": merchantId,
      "X-Secret": secretKey,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Platega status check failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = JSON.parse(text) as Record<string, any>;
  const details = data.paymentDetails || data;
  const amount = Number(details?.amount ?? data.amount ?? 0);
  const currency = String(details?.currency ?? data.currency ?? PRO_CURRENCY).toUpperCase();
  const status = normalizePlategaStatus(data.status);
  const rawPayload = typeof data.payload === "string" ? data.payload : data.payload ? JSON.stringify(data.payload) : null;
  const payloadUid = extractUidFromPayload(data.payload);

  return {
    transactionId: cleanId,
    status,
    amount,
    currency,
    payloadUid,
    rawPayload,
  };
}

// ---------- Local webhook confirmation store (fast cache for Express / warm Lambdas) ----------
function readConfirmedStore(): Record<string, ConfirmedWebhookRecord> {
  try {
    if (!fs.existsSync(CONFIRMED_STORE_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(CONFIRMED_STORE_FILE, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeConfirmedStore(store: Record<string, ConfirmedWebhookRecord>): void {
  try {
    const dir = path.dirname(CONFIRMED_STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIRMED_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // Non-fatal on read-only serverless FS; Platega status API remains authoritative.
  }
}

export function recordConfirmedWebhook(record: ConfirmedWebhookRecord): void {
  const store = readConfirmedStore();
  store[record.txnId] = record;
  writeConfirmedStore(store);
}

export function getConfirmedWebhook(txnId: string): ConfirmedWebhookRecord | null {
  const store = readConfirmedStore();
  return store[txnId] ?? null;
}

// ---------- Firestore REST helpers (authenticated as the user via Firebase ID Token) ----------
function decodeFirestoreField(field: any): any {
  if (!field || typeof field !== "object") return undefined;
  if ("stringValue" in field) return field.stringValue;
  if ("booleanValue" in field) return field.booleanValue;
  if ("integerValue" in field) return Number(field.integerValue);
  if ("doubleValue" in field) return Number(field.doubleValue);
  if ("timestampValue" in field) return field.timestampValue;
  if ("nullValue" in field) return null;
  return undefined;
}

function encodeFirestoreField(val: unknown): Record<string, any> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  return { stringValue: String(val) };
}

function sanitizeDocId(id: string): string {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

async function fetchUserProfileDoc(authed: AuthedUser): Promise<Record<string, any> | null> {
  if (!authed.isJwt || !PROJECT_ID) return null;
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}/profiles/${encodeURIComponent(authed.id)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authed.token}`,
      },
    });
    if (!res.ok) return null;
    const doc = (await res.json()) as { fields?: Record<string, any> };
    if (!doc.fields) return null;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(doc.fields)) {
      out[k] = decodeFirestoreField(v);
    }
    return out;
  } catch {
    return null;
  }
}

async function patchUserProfileFields(
  authed: AuthedUser,
  fields: Record<string, unknown>,
): Promise<boolean> {
  if (!authed.isJwt || !PROJECT_ID) return false;
  try {
    const keys = Object.keys(fields);
    if (!keys.length) return true;
    const params = keys.map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
    const encodedFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      encodedFields[k] = encodeFirestoreField(v);
    }
    const res = await fetch(
      `${FIRESTORE_REST_BASE}/profiles/${encodeURIComponent(authed.id)}?${params}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authed.token}`,
        },
        body: JSON.stringify({ fields: encodedFields }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function savePaymentRecordInFirestore(
  authed: AuthedUser,
  payment: {
    txnId: string;
    amount: number;
    currency: string;
    status: PlategaStatus;
    purpose: string;
  },
): Promise<boolean> {
  if (!authed.isJwt || !PROJECT_ID) return false;
  const docId = sanitizeDocId(payment.txnId);
  const nowIso = new Date().toISOString();
  const fields: Record<string, any> = {
    id: encodeFirestoreField(docId),
    user_id: encodeFirestoreField(authed.id),
    userId: encodeFirestoreField(authed.id),
    providerTxnId: encodeFirestoreField(payment.txnId),
    provider_txn_id: encodeFirestoreField(payment.txnId),
    amount: encodeFirestoreField(payment.amount),
    currency: encodeFirestoreField(payment.currency),
    status: encodeFirestoreField(payment.status),
    purpose: encodeFirestoreField(payment.purpose),
    created_at: encodeFirestoreField(nowIso),
    createdAt: encodeFirestoreField(nowIso),
    updated_at: encodeFirestoreField(nowIso),
    updatedAt: encodeFirestoreField(nowIso),
  };

  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}/payments/${encodeURIComponent(docId)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authed.token}`,
      },
      body: JSON.stringify({ fields }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function updatePaymentStatusInFirestore(
  authed: AuthedUser,
  txnId: string,
  status: PlategaStatus,
): Promise<boolean> {
  if (!authed.isJwt || !PROJECT_ID) return false;
  const docId = sanitizeDocId(txnId);
  const nowIso = new Date().toISOString();
  const params = ["status", "updated_at", "updatedAt"]
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  try {
    const res = await fetch(
      `${FIRESTORE_REST_BASE}/payments/${encodeURIComponent(docId)}?${params}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authed.token}`,
        },
        body: JSON.stringify({
          fields: {
            status: encodeFirestoreField(status),
            updated_at: encodeFirestoreField(nowIso),
            updatedAt: encodeFirestoreField(nowIso),
          },
        }),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

function buildSubscriptionState(params: {
  isPro: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  lastTxnId: string | null;
  pendingTxnId: string | null;
  wasExpired?: boolean;
}): SubscriptionState {
  const now = Date.now();
  const expMs = params.expiresAt ? Date.parse(params.expiresAt) : 0;
  const daysLeft =
    params.isPro && expMs > now
      ? Math.max(1, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)))
      : 0;
  const status: SubscriptionState["status"] = params.isPro
    ? "active"
    : params.pendingTxnId
      ? "pending"
      : params.wasExpired
        ? "expired"
        : "free";
  return {
    plan: params.isPro ? "pro" : "free",
    isPro: params.isPro,
    status,
    startedAt: params.startedAt,
    expiresAt: params.expiresAt,
    daysLeft,
    lastTxnId: params.lastTxnId,
    pendingTxnId: params.pendingTxnId,
    priceRub: PRO_PRICE_RUB,
    durationDays: PRO_DURATION_DAYS,
  };
}

export function invalidateUserTierCache(uid: string): void {
  TIER_CACHE.delete(uid);
}

/**
 * Authoritatively checks whether an authenticated user currently has an active Pro subscription.
 * Requires a valid server-signed HMAC proof tied to `authed.id` AND an unexpired `expiresAt`.
 * Even if someone manually edits `plan: "pro"` in Firestore, without a valid server HMAC proof
 * this strictly returns `false` (Free tier).
 */
export async function resolveEffectiveUserTier(authed: AuthedUser | null): Promise<{
  tier: "pro" | "free";
  isPro: boolean;
  expiresAt: string | null;
}> {
  if (!authed || !authed.isJwt) {
    return { tier: "free", isPro: false, expiresAt: null };
  }

  const cached = TIER_CACHE.get(authed.id);
  const now = Date.now();
  if (cached && now - cached.checkedAt < TIER_CACHE_TTL_MS) {
    const active = cached.isPro && cached.expiresAtMs > now;
    return {
      tier: active ? "pro" : "free",
      isPro: active,
      expiresAt: active ? new Date(cached.expiresAtMs).toISOString() : null,
    };
  }

  const profile = await fetchUserProfileDoc(authed);
  if (!profile) {
    TIER_CACHE.set(authed.id, { isPro: false, expiresAtMs: 0, checkedAt: now });
    return { tier: "free", isPro: false, expiresAt: null };
  }

  const proofToken = profile.subscription_proof || profile.subscriptionProof || null;
  const verified = verifySubscriptionProof(proofToken, authed.id);
  if (verified && verified.expiresAt > now) {
    TIER_CACHE.set(authed.id, {
      isPro: true,
      expiresAtMs: verified.expiresAt,
      checkedAt: now,
    });
    return {
      tier: "pro",
      isPro: true,
      expiresAt: new Date(verified.expiresAt).toISOString(),
    };
  }

  // If profile had an expired Pro subscription, auto-downgrade cleanly in Firestore
  if (profile.plan === "pro" && (!verified || verified.expiresAt <= now)) {
    void patchUserProfileFields(authed, {
      plan: "free",
      subscription_status: verified ? "expired" : "free",
      updated_at: new Date().toISOString(),
    });
  }

  TIER_CACHE.set(authed.id, { isPro: false, expiresAtMs: 0, checkedAt: now });
  return { tier: "free", isPro: false, expiresAt: null };
}

/**
 * Verifies a Platega transaction directly against Platega's API and activates (or extends)
 * the user's 30-day Pro subscription idempotently in Firestore.
 */
export async function verifyAndActivatePlategaTransaction(
  authed: AuthedUser,
  transactionId: string,
): Promise<{
  verified: boolean;
  paymentStatus: PlategaStatus;
  subscription: SubscriptionState;
  message?: string;
}> {
  const cleanId = String(transactionId || "").trim();
  const profile = await fetchUserProfileDoc(authed);
  const existingProof = verifySubscriptionProof(
    profile?.subscription_proof || profile?.subscriptionProof,
    authed.id,
  );
  const now = Date.now();

  // Idempotency: if this exact transaction already activated Pro, return current active state
  if (existingProof && existingProof.txnId === cleanId) {
    const active = existingProof.expiresAt > now;
    return {
      verified: true,
      paymentStatus: "CONFIRMED",
      subscription: buildSubscriptionState({
        isPro: active,
        startedAt: new Date(existingProof.startedAt).toISOString(),
        expiresAt: new Date(existingProof.expiresAt).toISOString(),
        lastTxnId: existingProof.txnId,
        pendingTxnId: null,
        wasExpired: !active,
      }),
    };
  }

  const info = await getPlategaTransactionStatus(cleanId);

  // Verify ownership: payload UID must match authenticated user (if payload present)
  if (info.payloadUid && info.payloadUid !== authed.id) {
    throw new Error("Transaction does not belong to the authenticated account.");
  }

  await updatePaymentStatusInFirestore(authed, cleanId, info.status);

  if (info.status !== "CONFIRMED") {
    const currentlyActive = Boolean(existingProof && existingProof.expiresAt > now);
    const pendingTxnId = info.status === "PENDING" ? cleanId : null;
    if (info.status === "CANCELED" || info.status === "CHARGEBACKED") {
      await patchUserProfileFields(authed, {
        subscription_pending_txn_id: null,
        updated_at: new Date().toISOString(),
      });
    }
    return {
      verified: false,
      paymentStatus: info.status,
      subscription: buildSubscriptionState({
        isPro: currentlyActive,
        startedAt: existingProof ? new Date(existingProof.startedAt).toISOString() : null,
        expiresAt: existingProof ? new Date(existingProof.expiresAt).toISOString() : null,
        lastTxnId: existingProof?.txnId ?? null,
        pendingTxnId,
        wasExpired: Boolean(existingProof && existingProof.expiresAt <= now),
      }),
      message:
        info.status === "PENDING"
          ? "Оплата ещё обрабатывается. Повторите проверку через несколько секунд."
          : `Платёж не подтверждён (статус: ${info.status}).`,
    };
  }

  // Verify paid amount covers Pro subscription price (SBP fees can make settled amount >= 149)
  if (info.amount > 0 && info.amount < PRO_PRICE_RUB) {
    throw new Error(`Paid amount (${info.amount} ${info.currency}) is less than required ${PRO_PRICE_RUB} RUB.`);
  }

  const baseStart =
    existingProof && existingProof.expiresAt > now ? existingProof.expiresAt : now;
  const startedAtMs = existingProof && existingProof.expiresAt > now ? existingProof.startedAt : now;
  const expiresAtMs = baseStart + PRO_DURATION_MS;

  const proof = signSubscriptionProof({
    uid: authed.id,
    plan: "pro",
    txnId: cleanId,
    startedAt: startedAtMs,
    expiresAt: expiresAtMs,
  });

  const startedIso = new Date(startedAtMs).toISOString();
  const expiresIso = new Date(expiresAtMs).toISOString();

  await patchUserProfileFields(authed, {
    plan: "pro",
    subscription_status: "active",
    subscription_started_at: startedIso,
    subscription_expires_at: expiresIso,
    subscription_txn_id: cleanId,
    subscription_pending_txn_id: null,
    subscription_proof: proof,
    updated_at: new Date().toISOString(),
  });

  recordConfirmedWebhook({
    txnId: cleanId,
    uid: authed.id,
    amount: info.amount || PRO_PRICE_RUB,
    currency: info.currency || PRO_CURRENCY,
    status: "CONFIRMED",
    confirmedAt: new Date().toISOString(),
  });

  TIER_CACHE.set(authed.id, {
    isPro: true,
    expiresAtMs,
    checkedAt: Date.now(),
  });

  return {
    verified: true,
    paymentStatus: "CONFIRMED",
    subscription: buildSubscriptionState({
      isPro: true,
      startedAt: startedIso,
      expiresAt: expiresIso,
      lastTxnId: cleanId,
      pendingTxnId: null,
    }),
  };
}

/**
 * Fetches current subscription status for the authenticated user,
 * automatically checking any pending Platega transaction and expiring lapsed subscriptions.
 */
export async function getUserSubscriptionStatus(
  authed: AuthedUser,
  candidatePendingTxnId?: string | null,
): Promise<SubscriptionState> {
  const profile = await fetchUserProfileDoc(authed);
  const now = Date.now();
  const pendingFromProfile =
    typeof profile?.subscription_pending_txn_id === "string" && profile.subscription_pending_txn_id
      ? profile.subscription_pending_txn_id
      : null;
  const pendingTxnId = (candidatePendingTxnId || "").trim() || pendingFromProfile;

  // If there is a pending transaction and Platega is configured, check it automatically!
  if (pendingTxnId && isPlategaConfigured()) {
    try {
      const check = await verifyAndActivatePlategaTransaction(authed, pendingTxnId);
      return check.subscription;
    } catch (err) {
      console.warn("[subscription] auto-check pending txn failed:", err instanceof Error ? err.message : String(err));
    }
  }

  const proofToken = profile?.subscription_proof || profile?.subscriptionProof || null;
  const verified = verifySubscriptionProof(proofToken, authed.id);

  if (verified && verified.expiresAt > now) {
    TIER_CACHE.set(authed.id, {
      isPro: true,
      expiresAtMs: verified.expiresAt,
      checkedAt: now,
    });
    return buildSubscriptionState({
      isPro: true,
      startedAt: new Date(verified.startedAt).toISOString(),
      expiresAt: new Date(verified.expiresAt).toISOString(),
      lastTxnId: verified.txnId,
      pendingTxnId: null,
    });
  }

  const wasExpired = Boolean(verified && verified.expiresAt <= now);
  if (profile?.plan === "pro" && (!verified || wasExpired)) {
    await patchUserProfileFields(authed, {
      plan: "free",
      subscription_status: wasExpired ? "expired" : "free",
      updated_at: new Date().toISOString(),
    });
  }
  invalidateUserTierCache(authed.id);

  return buildSubscriptionState({
    isPro: false,
    startedAt: verified ? new Date(verified.startedAt).toISOString() : null,
    expiresAt: verified ? new Date(verified.expiresAt).toISOString() : null,
    lastTxnId: verified?.txnId ?? null,
    pendingTxnId,
    wasExpired,
  });
}

export async function markPendingTransactionOnProfile(
  authed: AuthedUser,
  txnId: string,
): Promise<void> {
  await patchUserProfileFields(authed, {
    subscription_pending_txn_id: txnId,
    updated_at: new Date().toISOString(),
  });
}
