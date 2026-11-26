import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import firebaseConfig from "../../firebase-applet-config.json";
import { getWritableDataDir } from "./server-data-dir";
import type { AuthedUser } from "./memory-server";
import {
  hashLicenseKey,
  isKnownLicenseKeyHash,
  isValidLicenseKeyFormat,
  normalizeLicenseKey,
} from "./license-keys";

export const PRO_DURATION_DAYS = 30;
export const PRO_DURATION_MS = PRO_DURATION_DAYS * 24 * 60 * 60 * 1000;

const REDEEMED_KEYS_FILE = path.join(getWritableDataDir(), "redeemed-license-keys.json");

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

export interface SubscriptionState {
  plan: "free" | "pro";
  isPro: boolean;
  status: "active" | "expired" | "free";
  startedAt: string | null;
  expiresAt: string | null;
  daysLeft: number;
  lastKeyId: string | null;
  durationDays: number;
}

interface SignedProofPayload {
  uid: string;
  plan: "pro";
  txnId: string;
  startedAt: number;
  expiresAt: number;
}

interface LocalRedeemedRecord {
  redeemedBy: string;
  redeemedAt: string;
  durationDays: number;
}

export class LicenseKeyError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LicenseKeyError";
    this.status = status;
  }
}

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString("hex");
const TIER_CACHE = new Map<string, { isPro: boolean; expiresAtMs: number; checkedAt: number }>();
const TIER_CACHE_TTL_MS = 45_000;

// In-memory lock set + failed-attempt sliding window limiter (10 failures / 15 min)
const IN_MEMORY_REDEEMED = new Set<string>();
const IN_FLIGHT_KEYS = new Set<string>();
const FAILED_ATTEMPTS = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 10;

function getSigningSecret(): string {
  const explicit = (process.env.SUBSCRIPTION_SIGNING_SECRET || "").trim();
  if (explicit) return explicit;
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

// ---------- Sliding-window brute-force protection ----------
function checkRateLimit(actorKey: string, now = Date.now()): void {
  const existing = FAILED_ATTEMPTS.get(actorKey) || [];
  const recent = existing.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_FAILURES) {
    FAILED_ATTEMPTS.set(actorKey, recent);
    throw new LicenseKeyError(
      "Слишком много неудачных попыток ввода ключа. Повторите через 15 минут.",
      429,
    );
  }
  if (recent.length !== existing.length) {
    FAILED_ATTEMPTS.set(actorKey, recent);
  }
}

function recordFailedAttempt(actorKey: string, now = Date.now()): void {
  const existing = FAILED_ATTEMPTS.get(actorKey) || [];
  const recent = existing.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  FAILED_ATTEMPTS.set(actorKey, recent);
}

// ---------- Local single-use key persistence (fast cache + test/local store) ----------
function readLocalRedeemedStore(): Record<string, LocalRedeemedRecord> {
  try {
    if (!fs.existsSync(REDEEMED_KEYS_FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(REDEEMED_KEYS_FILE, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalRedeemedStore(store: Record<string, LocalRedeemedRecord>): void {
  try {
    const dir = path.dirname(REDEEMED_KEYS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REDEEMED_KEYS_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch {
    // Non-fatal on read-only serverless FS; Firestore redeemed_keys remains authoritative.
  }
}

function isRedeemedLocally(keyHash: string): boolean {
  if (IN_MEMORY_REDEEMED.has(keyHash)) return true;
  const store = readLocalRedeemedStore();
  if (store[keyHash]) {
    IN_MEMORY_REDEEMED.add(keyHash);
    return true;
  }
  return false;
}

function markRedeemedLocally(keyHash: string, uid: string, redeemedAt: string): void {
  IN_MEMORY_REDEEMED.add(keyHash);
  const store = readLocalRedeemedStore();
  store[keyHash] = {
    redeemedBy: uid,
    redeemedAt,
    durationDays: PRO_DURATION_DAYS,
  };
  writeLocalRedeemedStore(store);
}

export function resetLocalLicenseKeyTestState(keyHash?: string): void {
  if (keyHash) {
    IN_MEMORY_REDEEMED.delete(keyHash);
    IN_FLIGHT_KEYS.delete(keyHash);
    const store = readLocalRedeemedStore();
    if (store[keyHash]) {
      delete store[keyHash];
      writeLocalRedeemedStore(store);
    }
  } else {
    IN_MEMORY_REDEEMED.clear();
    IN_FLIGHT_KEYS.clear();
    FAILED_ATTEMPTS.clear();
  }
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

/**
 * Atomically claims a license key in Firestore via create-only POST
 * (`/redeemed_keys?documentId={keyHash}`).
 * Firestore guarantees that only ONE caller can ever create a given document ID;
 * every subsequent attempt receives 409 ALREADY_EXISTS and the key stays dead forever.
 */
async function claimKeyAtomicallyInFirestore(
  authed: AuthedUser,
  keyHash: string,
  redeemedAt: string,
): Promise<void> {
  if (!authed.isJwt || !PROJECT_ID) return;

  const res = await fetch(
    `${FIRESTORE_REST_BASE}/redeemed_keys?documentId=${encodeURIComponent(keyHash)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authed.token}`,
      },
      body: JSON.stringify({
        fields: {
          redeemedBy: encodeFirestoreField(authed.id),
          redeemedAt: encodeFirestoreField(redeemedAt),
          durationDays: encodeFirestoreField(PRO_DURATION_DAYS),
        },
      }),
    },
  );

  if (res.ok) return;

  if (res.status === 409) {
    markRedeemedLocally(keyHash, "already_used", redeemedAt);
    throw new LicenseKeyError("Этот ключ уже был использован.", 409);
  }

  // Some Firestore rule evaluations return 403 when a create-only doc already exists
  if (res.status === 403) {
    try {
      const checkRes = await fetch(
        `${FIRESTORE_REST_BASE}/redeemed_keys/${encodeURIComponent(keyHash)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${authed.token}` },
        },
      );
      if (checkRes.ok) {
        markRedeemedLocally(keyHash, "already_used", redeemedAt);
        throw new LicenseKeyError("Этот ключ уже был использован.", 409);
      }
    } catch (err) {
      if (err instanceof LicenseKeyError) throw err;
    }
    throw new LicenseKeyError(
      "Не удалось подтвердить ключ в облачной базе. Обновите сессию и попробуйте снова.",
      503,
    );
  }

  throw new LicenseKeyError(
    `Сервис активации временно недоступен (${res.status}). Попробуйте чуть позже.`,
    503,
  );
}

function buildSubscriptionState(params: {
  isPro: boolean;
  startedAt: string | null;
  expiresAt: string | null;
  lastKeyId: string | null;
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
    lastKeyId: params.lastKeyId,
    durationDays: PRO_DURATION_DAYS,
  };
}

export function invalidateUserTierCache(uid: string): void {
  TIER_CACHE.delete(uid);
}

/**
 * Authoritatively checks whether an authenticated user currently has an active Pro subscription.
 * Requires a valid server-signed HMAC proof tied to `authed.id` AND an unexpired `expiresAt`.
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
 * Redeems a single-use IGseek Pro license key for 30 days (or extends an active Pro
 * subscription by +30 days) and permanently burns the key so it can never be reused.
 */
export async function redeemLicenseKey(
  authed: AuthedUser,
  rawKey: string,
  options?: {
    clientIp?: string;
    skipFirestore?: boolean;
    extraAllowedHashes?: ReadonlySet<string>;
  },
): Promise<{
  redeemed: true;
  subscription: SubscriptionState;
}> {
  const actorKey = `${authed.id}:${options?.clientIp || "direct"}`;
  checkRateLimit(actorKey);

  const normalized = normalizeLicenseKey(rawKey);
  if (!isValidLicenseKeyFormat(normalized)) {
    recordFailedAttempt(actorKey);
    throw new LicenseKeyError(
      "Неверный формат ключа. Ожидается формат IGSK-XXXX-XXXX-XXXX.",
      400,
    );
  }

  const keyHash = hashLicenseKey(normalized);
  if (!isKnownLicenseKeyHash(keyHash, options?.extraAllowedHashes)) {
    recordFailedAttempt(actorKey);
    throw new LicenseKeyError("Неверный ключ активации. Проверьте правильность ввода.", 400);
  }

  if (IN_FLIGHT_KEYS.has(keyHash) || isRedeemedLocally(keyHash)) {
    throw new LicenseKeyError("Этот ключ уже был использован.", 409);
  }

  IN_FLIGHT_KEYS.add(keyHash);
  const now = Date.now();
  const redeemedAtIso = new Date(now).toISOString();

  try {
    if (!options?.skipFirestore) {
      await claimKeyAtomicallyInFirestore(authed, keyHash, redeemedAtIso);
    }

    // Double-check local lock after await and permanently burn key locally as well
    if (isRedeemedLocally(keyHash)) {
      throw new LicenseKeyError("Этот ключ уже был использован.", 409);
    }
    markRedeemedLocally(keyHash, authed.id, redeemedAtIso);

    const profile = options?.skipFirestore ? null : await fetchUserProfileDoc(authed);
    const existingProof = verifySubscriptionProof(
      profile?.subscription_proof || profile?.subscriptionProof,
      authed.id,
    );

    const baseStart =
      existingProof && existingProof.expiresAt > now ? existingProof.expiresAt : now;
    const startedAtMs =
      existingProof && existingProof.expiresAt > now ? existingProof.startedAt : now;
    const expiresAtMs = baseStart + PRO_DURATION_MS;
    const keyTag = `key_${keyHash.slice(0, 12)}`;

    const proof = signSubscriptionProof({
      uid: authed.id,
      plan: "pro",
      txnId: keyTag,
      startedAt: startedAtMs,
      expiresAt: expiresAtMs,
    });

    const startedIso = new Date(startedAtMs).toISOString();
    const expiresIso = new Date(expiresAtMs).toISOString();

    if (!options?.skipFirestore) {
      await patchUserProfileFields(authed, {
        plan: "pro",
        subscription_status: "active",
        subscription_started_at: startedIso,
        subscription_expires_at: expiresIso,
        subscription_txn_id: keyTag,
        subscription_pending_txn_id: null,
        subscription_proof: proof,
        updated_at: redeemedAtIso,
      });
    }

    TIER_CACHE.set(authed.id, {
      isPro: true,
      expiresAtMs,
      checkedAt: Date.now(),
    });

    return {
      redeemed: true,
      subscription: buildSubscriptionState({
        isPro: true,
        startedAt: startedIso,
        expiresAt: expiresIso,
        lastKeyId: keyTag,
      }),
    };
  } finally {
    IN_FLIGHT_KEYS.delete(keyHash);
  }
}

/**
 * Fetches current subscription status for the authenticated user and automatically
 * expires lapsed subscriptions.
 */
export async function getUserSubscriptionStatus(authed: AuthedUser): Promise<SubscriptionState> {
  const profile = await fetchUserProfileDoc(authed);
  const now = Date.now();
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
      lastKeyId: verified.txnId,
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
    lastKeyId: verified?.txnId ?? null,
    wasExpired,
  });
}
