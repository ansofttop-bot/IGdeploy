export interface IdempotentResult<T> {
  value: T;
  replayed: boolean;
}

interface CachedRecord {
  status: "pending" | "completed";
  expiresAtMs: number;
  promise?: Promise<unknown>;
  value?: unknown;
}

interface IdempotencyStoreState {
  records: Map<string, CachedRecord>;
}

function getStore(): IdempotencyStoreState {
  const g = globalThis as typeof globalThis & { __igseekIdempotencyStore?: IdempotencyStoreState };
  if (!g.__igseekIdempotencyStore) {
    g.__igseekIdempotencyStore = {
      records: new Map<string, CachedRecord>(),
    };
  }
  return g.__igseekIdempotencyStore;
}

function pruneExpired(store: IdempotencyStoreState, now: number): void {
  if (store.records.size < 400) return;
  for (const [k, rec] of store.records.entries()) {
    if (rec.expiresAtMs <= now && rec.status === "completed") {
      store.records.delete(k);
    }
  }
}

export function extractIdempotencyKey(
  request: Request,
  body?: Record<string, unknown> | null,
): string | null {
  const headerVal =
    request.headers.get("idempotency-key") ||
    request.headers.get("x-idempotency-key") ||
    "";
  const bodyVal = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : "";
  const raw = (headerVal || bodyVal).trim();
  if (!raw || raw.length > 160) return null;
  if (!/^[a-zA-Z0-9._:-]+$/.test(raw)) return null;
  return raw;
}

/**
 * Guarantees that concurrent or repeated calls sharing (scope, actorId, key)
 * execute `work()` at most once within `ttlMs` and return the same result.
 * Failures are evicted immediately so legitimate retries can proceed.
 */
export async function withIdempotentExecution<T>(
  opts: {
    scope: string;
    actorId: string;
    key: string | null | undefined;
    ttlMs?: number;
  },
  work: () => Promise<T>,
): Promise<IdempotentResult<T>> {
  const cleanKey = (opts.key || "").trim();
  if (!cleanKey) {
    const value = await work();
    return { value, replayed: false };
  }

  const store = getStore();
  const now = Date.now();
  pruneExpired(store, now);

  const compositeKey = `${opts.scope}:${opts.actorId}:${cleanKey}`;
  const ttlMs = Math.max(5_000, opts.ttlMs ?? 5 * 60_000);
  const existing = store.records.get(compositeKey);

  if (existing && existing.expiresAtMs > now) {
    if (existing.status === "completed") {
      return { value: existing.value as T, replayed: true };
    }
    if (existing.promise) {
      const val = (await existing.promise) as T;
      return { value: val, replayed: true };
    }
  }

  const execPromise = (async () => {
    try {
      const value = await work();
      store.records.set(compositeKey, {
        status: "completed",
        expiresAtMs: Date.now() + ttlMs,
        value,
      });
      return value;
    } catch (err) {
      store.records.delete(compositeKey);
      throw err;
    }
  })();

  store.records.set(compositeKey, {
    status: "pending",
    expiresAtMs: now + ttlMs,
    promise: execPromise,
  });

  const value = await execPromise;
  return { value, replayed: false };
}

export function clearIdempotencyStore(): void {
  getStore().records.clear();
}
