import fs from "node:fs";
import path from "node:path";
import { getWritableDataDir } from "./server-data-dir";

export const DAILY_PHOTO_LIMIT = 20;
export const PHOTO_RESET_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type ServerPhotoQuotaState = {
  used: number;
  resetAt: number;
};

export type ClientPhotoQuotaHint = {
  used?: number;
  resetAt?: number;
};

const DATA_DIR = getWritableDataDir();
const STORE_FILE = path.join(DATA_DIR, "photo-limits.json");

let cache: Map<string, ServerPhotoQuotaState> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function ensureStoreLoaded(): Map<string, ServerPhotoQuotaState> {
  if (cache) return cache;
  const map = new Map<string, ServerPhotoQuotaState>();
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as Record<string, ServerPhotoQuotaState>;
      const now = Date.now();
      for (const [k, v] of Object.entries(raw || {})) {
        if (!v || typeof v.used !== "number") continue;
        const normalized = normalizeState(v, now);
        if (normalized.used > 0 || normalized.resetAt > now) {
          map.set(k, normalized);
        }
      }
    }
  } catch (err) {
    console.warn("Failed to load photo limits store:", err);
  }
  cache = map;
  return map;
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      const map = ensureStoreLoaded();
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const obj: Record<string, ServerPhotoQuotaState> = {};
      const now = Date.now();
      for (const [k, v] of map.entries()) {
        const norm = normalizeState(v, now);
        if (norm.used > 0 || norm.resetAt > now) {
          obj[k] = norm;
        }
      }
      fs.writeFileSync(STORE_FILE, JSON.stringify(obj), "utf8");
    } catch (err) {
      console.warn("Failed to persist photo limits store:", err);
    }
  }, 250);
  if (typeof flushTimer.unref === "function") {
    flushTimer.unref();
  }
}

function normalizeState(raw: ServerPhotoQuotaState | undefined, now: number): ServerPhotoQuotaState {
  const usedRaw = Number(raw?.used ?? 0);
  let used = Number.isFinite(usedRaw) && usedRaw > 0 ? Math.min(DAILY_PHOTO_LIMIT, Math.floor(usedRaw)) : 0;
  const resetRaw = Number(raw?.resetAt ?? 0);
  let resetAt = Number.isFinite(resetRaw) && resetRaw > 0 ? Math.floor(resetRaw) : 0;

  if (resetAt > 0 && now >= resetAt) {
    used = 0;
    resetAt = 0;
  } else if (used >= DAILY_PHOTO_LIMIT && resetAt === 0) {
    resetAt = now + PHOTO_RESET_INTERVAL_MS;
  } else if (used < DAILY_PHOTO_LIMIT && resetAt !== 0) {
    resetAt = 0;
  }

  return { used, resetAt };
}

function mergeWithHint(
  serverState: ServerPhotoQuotaState,
  hint: ClientPhotoQuotaHint | undefined,
  now: number,
): ServerPhotoQuotaState {
  if (!hint) return serverState;
  const normHint = normalizeState(
    { used: hint.used ?? 0, resetAt: hint.resetAt ?? 0 },
    now,
  );
  const mergedUsed = Math.min(DAILY_PHOTO_LIMIT, Math.max(serverState.used, normHint.used));
  let mergedResetAt = 0;
  if (mergedUsed >= DAILY_PHOTO_LIMIT) {
    const candidates = [serverState.resetAt, normHint.resetAt].filter((t) => t > now);
    mergedResetAt = candidates.length > 0 ? Math.max(...candidates) : now + PHOTO_RESET_INTERVAL_MS;
  }
  return { used: mergedUsed, resetAt: mergedResetAt };
}

export function resolvePhotoQuotaActorKey(
  request: Request,
  authedUid: string | null | undefined,
  deviceFp?: string | null,
): string {
  if (authedUid && authedUid.trim()) {
    return `uid:${authedUid.trim()}`;
  }
  const cleanFp = (deviceFp || request.headers.get("x-device-fp") || "").trim();
  if (cleanFp && /^[a-zA-Z0-9_-]{16,128}$/.test(cleanFp)) {
    return `dev:${cleanFp}`;
  }
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim() || request.headers.get("x-real-ip")?.trim() || "anon";
  return `ip:${ip.slice(0, 64)}`;
}

export function checkServerPhotoQuota(
  actorKey: string,
  hint?: ClientPhotoQuotaHint,
): { allowed: boolean; used: number; limit: number; resetAt: number } {
  const now = Date.now();
  const map = ensureStoreLoaded();
  const current = normalizeState(map.get(actorKey), now);
  const merged = mergeWithHint(current, hint, now);
  if (merged.used !== current.used || merged.resetAt !== current.resetAt) {
    map.set(actorKey, merged);
    scheduleFlush();
  }
  return {
    allowed: merged.used < DAILY_PHOTO_LIMIT,
    used: merged.used,
    limit: DAILY_PHOTO_LIMIT,
    resetAt: merged.resetAt,
  };
}

export function consumeServerPhotoQuota(
  actorKey: string,
  hint?: ClientPhotoQuotaHint,
): { used: number; limit: number; resetAt: number } {
  const now = Date.now();
  const map = ensureStoreLoaded();
  const current = mergeWithHint(normalizeState(map.get(actorKey), now), hint, now);
  const nextUsed = Math.min(DAILY_PHOTO_LIMIT, current.used + 1);
  const nextResetAt =
    nextUsed >= DAILY_PHOTO_LIMIT
      ? current.resetAt > now
        ? current.resetAt
        : now + PHOTO_RESET_INTERVAL_MS
      : 0;
  const updated: ServerPhotoQuotaState = { used: nextUsed, resetAt: nextResetAt };
  map.set(actorKey, updated);
  scheduleFlush();
  return {
    used: updated.used,
    limit: DAILY_PHOTO_LIMIT,
    resetAt: updated.resetAt,
  };
}

// ---------- Pro hourly anti-abuse tracker (4 GPT Image 2 images / sliding hour -> Pollinations + user notice) ----------
export const PRO_HOURLY_PAID_IMAGE_LIMIT = 4;
export const PRO_HOURLY_WINDOW_MS = 60 * 60 * 1000;

const PRO_HOURLY_STORE_FILE = path.join(DATA_DIR, "pro-hourly-images.json");
let proHourlyCache: Map<string, number[]> | null = null;
let proHourlyFlushTimer: ReturnType<typeof setTimeout> | null = null;

function ensureProHourlyLoaded(): Map<string, number[]> {
  if (proHourlyCache) return proHourlyCache;
  const map = new Map<string, number[]>();
  try {
    if (fs.existsSync(PRO_HOURLY_STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PRO_HOURLY_STORE_FILE, "utf8")) as Record<string, number[]>;
      const cutoff = Date.now() - PRO_HOURLY_WINDOW_MS;
      for (const [k, arr] of Object.entries(raw || {})) {
        if (!Array.isArray(arr)) continue;
        const recent = arr.filter((ts) => typeof ts === "number" && ts > cutoff);
        if (recent.length > 0) map.set(k, recent);
      }
    }
  } catch {
    // non-fatal
  }
  proHourlyCache = map;
  return map;
}

function scheduleProHourlyFlush(): void {
  if (proHourlyFlushTimer) return;
  proHourlyFlushTimer = setTimeout(() => {
    proHourlyFlushTimer = null;
    try {
      const map = ensureProHourlyLoaded();
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const cutoff = Date.now() - PRO_HOURLY_WINDOW_MS;
      const obj: Record<string, number[]> = {};
      for (const [k, arr] of map.entries()) {
        const recent = arr.filter((ts) => ts > cutoff);
        if (recent.length > 0) obj[k] = recent;
      }
      fs.writeFileSync(PRO_HOURLY_STORE_FILE, JSON.stringify(obj), "utf8");
    } catch {
      // non-fatal on serverless FS
    }
  }, 250);
  if (typeof proHourlyFlushTimer.unref === "function") {
    proHourlyFlushTimer.unref();
  }
}

export interface ProHourlyImageRoute {
  usePollinationsFallback: boolean;
  useSilentPollinations: boolean;
  countInLastHour: number;
  limit: number;
  remainingPaid: number;
  resetAt: number | null;
  retryAfterMinutes: number;
}

/**
 * Evaluates whether a Pro user has reached the anti-abuse limit of 4 GPT Image 2
 * generations/edits within the sliding 60-minute window.
 * When reached, callers switch to Pollinations and notify the user; once the oldest
 * GPT Image 2 timestamp expires (> 60 min ago), GPT Image 2 automatically resumes.
 */
export function evaluateProHourlyImageRoute(actorKey: string, now = Date.now()): ProHourlyImageRoute {
  const cutoff = now - PRO_HOURLY_WINDOW_MS;
  const map = ensureProHourlyLoaded();
  const recent = (map.get(actorKey) || []).filter((ts) => ts > cutoff).sort((a, b) => a - b);
  map.set(actorKey, recent);

  const reached = recent.length >= PRO_HOURLY_PAID_IMAGE_LIMIT;
  const oldestTs = recent.length > 0 ? recent[0] : null;
  const resetAt = reached && oldestTs !== null ? oldestTs + PRO_HOURLY_WINDOW_MS : null;
  const retryAfterMinutes = resetAt !== null ? Math.max(1, Math.ceil((resetAt - now) / 60_000)) : 0;

  return {
    usePollinationsFallback: reached,
    useSilentPollinations: reached,
    countInLastHour: recent.length,
    limit: PRO_HOURLY_PAID_IMAGE_LIMIT,
    remainingPaid: Math.max(0, PRO_HOURLY_PAID_IMAGE_LIMIT - recent.length),
    resetAt,
    retryAfterMinutes,
  };
}

/**
 * Records a GPT Image 2 generation/edit timestamp in the sliding 60-minute window.
 * Must ONLY be called when GPT Image 2 is actually used (NOT during Pollinations fallback),
 * so the rolling window expires cleanly after 60 minutes and restores GPT Image 2.
 */
export function recordProHourlyImageGeneration(actorKey: string, now = Date.now()): number {
  const cutoff = now - PRO_HOURLY_WINDOW_MS;
  const map = ensureProHourlyLoaded();
  const recent = (map.get(actorKey) || []).filter((ts) => ts > cutoff);
  recent.push(now);
  map.set(actorKey, recent);
  scheduleProHourlyFlush();
  return recent.length;
}

export function resetProHourlyImageTracker(actorKey?: string): void {
  const map = ensureProHourlyLoaded();
  if (actorKey) {
    map.delete(actorKey);
  } else {
    map.clear();
  }
}


