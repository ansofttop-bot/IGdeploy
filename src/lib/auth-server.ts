import crypto from "node:crypto";
import firebaseConfig from "../../firebase-applet-config.json";

const GOOGLE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export interface VerifiedFirebaseToken {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  issuer: string;
  audience: string;
  issuedAt: number;
  expiresAt: number;
}

interface JwkKey {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

interface JwksCacheState {
  keys: Map<string, crypto.KeyObject>;
  expiresAtMs: number;
  inFlight: Promise<Map<string, crypto.KeyObject>> | null;
}

function getJwksCache(): JwksCacheState {
  const g = globalThis as typeof globalThis & { __igseekFirebaseJwks?: JwksCacheState };
  if (!g.__igseekFirebaseJwks) {
    g.__igseekFirebaseJwks = {
      keys: new Map(),
      expiresAtMs: 0,
      inFlight: null,
    };
  }
  return g.__igseekFirebaseJwks;
}

export function getFirebaseProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    (firebaseConfig as { projectId?: string }).projectId ||
    ""
  ).trim();
}

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    const raw = Buffer.from(segment, "base64url").toString("utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function loadFirebasePublicKeys(forceRefresh = false): Promise<Map<string, crypto.KeyObject>> {
  const cache = getJwksCache();
  const now = Date.now();
  if (!forceRefresh && cache.keys.size > 0 && now < cache.expiresAtMs) {
    return cache.keys;
  }
  if (cache.inFlight) {
    return cache.inFlight;
  }

  cache.inFlight = (async () => {
    const res = await fetch(GOOGLE_JWKS_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch Firebase JWKS (HTTP ${res.status})`);
    }
    const cacheControl = res.headers.get("cache-control") || "";
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    const ttlMs = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) * 1000 : 3_600_000;

    const json = (await res.json()) as { keys?: JwkKey[] };
    const next = new Map<string, crypto.KeyObject>();
    for (const jwk of json.keys || []) {
      if (!jwk.kid || jwk.kty !== "RSA") continue;
      try {
        const keyObj = crypto.createPublicKey({
          key: jwk as unknown as crypto.JsonWebKey,
          format: "jwk",
        });
        next.set(jwk.kid, keyObj);
      } catch {
        // Ignore malformed JWK entries
      }
    }
    if (next.size > 0) {
      cache.keys = next;
      cache.expiresAtMs = Date.now() + ttlMs;
    }
    return cache.keys;
  })().finally(() => {
    cache.inFlight = null;
  });

  return cache.inFlight;
}

export interface VerifyTokenOptions {
  projectId?: string;
  publicKeysOverride?: Map<string, crypto.KeyObject>;
  nowSec?: number;
}

/**
 * Cryptographically verifies a Firebase RS256 ID Token against Google's JWKS.
 * Enforces alg === "RS256", valid signature, kid, iss, aud, sub, iat, and exp.
 */
export async function verifyFirebaseIdToken(
  token: string,
  options: VerifyTokenOptions = {},
): Promise<VerifiedFirebaseToken | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  const payload = decodeBase64UrlJson<Record<string, unknown>>(payloadB64);
  if (!header || !payload) return null;

  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    return null;
  }

  const projectId = (options.projectId || getFirebaseProjectId()).trim();
  if (!projectId) return null;

  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  const clockSkewSec = 120;

  const exp = Number(payload.exp);
  const iat = Number(payload.iat);
  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  const iss = typeof payload.iss === "string" ? payload.iss.trim() : "";
  const aud = typeof payload.aud === "string" ? payload.aud.trim() : "";

  const expectedIss = `https://securetoken.google.com/${projectId}`;
  if (!sub || sub.length > 128) return null;
  if (aud !== projectId) return null;
  if (iss !== expectedIss) return null;
  if (!Number.isFinite(exp) || exp <= nowSec - clockSkewSec) return null;
  if (!Number.isFinite(iat) || iat > nowSec + clockSkewSec) return null;

  let publicKey: crypto.KeyObject | undefined;
  if (options.publicKeysOverride) {
    publicKey = options.publicKeysOverride.get(header.kid);
  } else {
    try {
      let keys = await loadFirebasePublicKeys(false);
      publicKey = keys.get(header.kid);
      if (!publicKey) {
        keys = await loadFirebasePublicKeys(true);
        publicKey = keys.get(header.kid);
      }
    } catch (err) {
      console.error("[auth-server] JWKS fetch error:", err);
      return null;
    }
  }

  if (!publicKey) return null;

  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, "utf8");
  let sigBytes: Buffer;
  try {
    sigBytes = Buffer.from(signatureB64, "base64url");
  } catch {
    return null;
  }

  const verified = crypto.verify("RSA-SHA256", signingInput, publicKey, sigBytes);
  if (!verified) return null;

  return {
    uid: sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    emailVerified: Boolean(payload.email_verified),
    issuer: iss,
    audience: aud,
    issuedAt: iat,
    expiresAt: exp,
  };
}
