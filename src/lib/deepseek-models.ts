export type UiModel = "instinct" | "chat" | "f1";
export type AiCreativity = "exact" | "balance" | "vivid" | "chaos";
export type AiLength = "short" | "medium" | "long" | "unlimited";

/**
 * Strictly DeepSeek < 4.0 model mapping across IGseek fallback providers:
 *
 * - IGseek Instinct (default flagship, < V4.0):
 *     Direct DeepSeek: deepseek-chat             (DeepSeek-V3.2 / V3)
 *     ApiMira:         deepseek/deepseek-v3.2
 *
 * - IGseek Chat (conversational, < V4.0):
 *     Direct DeepSeek: deepseek-chat             (DeepSeek-V3)
 *     ApiMira:         deepseek/deepseek-chat-v3-0324
 *
 * - IGseek Flash (fast, < V4.0):
 *     Direct DeepSeek: deepseek-chat
 *     ApiMira:         deepseek/deepseek-chat
 *
 * - Reasoner mode (reasoning: true, < V4.0):
 *     Direct DeepSeek: deepseek-reasoner         (DeepSeek-R1 / V3-Reasoner)
 *     ApiMira:         deepseek/deepseek-r1
 */
export const DEEPSEEK_DIRECT_INSTINCT = "deepseek-chat";
export const DEEPSEEK_DIRECT_CHAT = "deepseek-chat";
export const DEEPSEEK_DIRECT_F1 = "deepseek-chat";
export const DEEPSEEK_DIRECT_REASONER = "deepseek-reasoner";

export const APIMIRA_DEEPSEEK_INSTINCT = "deepseek/deepseek-v3.2";
export const APIMIRA_DEEPSEEK_CHAT = "deepseek/deepseek-chat-v3-0324";
export const APIMIRA_DEEPSEEK_F1 = "deepseek/deepseek-chat";
export const APIMIRA_DEEPSEEK_REASONER = "deepseek/deepseek-r1";

export interface ModelProfile {
  directModel: string;
  apimiraModel: string;
  temperature: number;
  top_p: number;
}

export const MODEL_PROFILES: Record<UiModel, ModelProfile> = {
  instinct: {
    directModel: DEEPSEEK_DIRECT_INSTINCT,
    apimiraModel: APIMIRA_DEEPSEEK_INSTINCT,
    temperature: 0.8,
    top_p: 0.95,
  },
  chat: {
    directModel: DEEPSEEK_DIRECT_CHAT,
    apimiraModel: APIMIRA_DEEPSEEK_CHAT,
    temperature: 1.0,
    top_p: 0.95,
  },
  f1: {
    directModel: DEEPSEEK_DIRECT_F1,
    apimiraModel: APIMIRA_DEEPSEEK_F1,
    temperature: 0.4,
    top_p: 0.9,
  },
};

export function resolveDirectDeepSeekModel(model: UiModel = "instinct", reasoning = false): string {
  if (reasoning) return DEEPSEEK_DIRECT_REASONER;
  return (MODEL_PROFILES[model] ?? MODEL_PROFILES.instinct).directModel;
}

export function resolveApimiraDeepSeekModel(model: UiModel = "instinct", reasoning = false): string {
  if (reasoning) return APIMIRA_DEEPSEEK_REASONER;
  return (MODEL_PROFILES[model] ?? MODEL_PROFILES.instinct).apimiraModel;
}

/**
 * Returns a deduplicated list of DeepSeek <= 4.0 models on ApiMira, starting with
 * the requested IGseek model's dedicated model and falling back to the remaining <= 4.0 models
 * if an upstream gateway shard returns transient 5xx.
 * Shards currently cooling down from a recent 502/503/504 are placed at the end so
 * requests do not burn extra latency hitting a down shard on every turn.
 */
interface DeepSeekHealthStore {
  apimiraShardCooldownUntil: Map<string, number>;
  directBalanceCooldownUntil: number;
  prewarmLastAt: number;
  prewarmInFlight: Promise<void> | null;
}

function getHealthStore(): DeepSeekHealthStore {
  const g = globalThis as typeof globalThis & { __igseekDeepSeekHealth?: DeepSeekHealthStore };
  if (!g.__igseekDeepSeekHealth) {
    g.__igseekDeepSeekHealth = {
      apimiraShardCooldownUntil: new Map<string, number>(),
      directBalanceCooldownUntil: 0,
      prewarmLastAt: 0,
      prewarmInFlight: null,
    };
  }
  return g.__igseekDeepSeekHealth;
}

const APIMIRA_SHARD_COOLDOWN_MS = 15 * 60_000;

/**
 * ApiMira DeepSeek-V4 shards run hidden chain-of-thought reasoning by default unless explicitly disabled,
 * adding extra tokens and delay before the first visible token. Pass these fields whenever reasoning mode is OFF.
 */
export const APIMIRA_NO_REASONING_PARAMS = {
  enable_thinking: false,
  thinking: { type: "disabled", budget_tokens: 0 },
  reasoning: { enabled: false, max_tokens: 0 },
} as const;

export function markApimiraModelUnhealthy(modelId: string, status: number): void {
  if (status === 502 || status === 503 || status === 504 || status === 429) {
    getHealthStore().apimiraShardCooldownUntil.set(modelId, Date.now() + APIMIRA_SHARD_COOLDOWN_MS);
  }
}

export function markApimiraModelHealthy(modelId: string): void {
  getHealthStore().apimiraShardCooldownUntil.delete(modelId);
}

export function getApimiraFallbackChain(model: UiModel = "instinct", reasoning = false): string[] {
  const primary = resolveApimiraDeepSeekModel(model, reasoning);
  const all = Array.from(
    new Set([
      primary,
      APIMIRA_DEEPSEEK_CHAT,
      APIMIRA_DEEPSEEK_INSTINCT,
      APIMIRA_DEEPSEEK_F1,
    ]),
  );
  const now = Date.now();
  const cooldowns = getHealthStore().apimiraShardCooldownUntil;
  const healthy: string[] = [];
  const cooling: string[] = [];
  for (const m of all) {
    const until = cooldowns.get(m) ?? 0;
    if (until > now) cooling.push(m);
    else healthy.push(m);
  }
  return [...healthy, ...cooling];
}

export function resolveEffectiveTemperature(model: UiModel = "instinct", creativity?: string): number {
  const base = (MODEL_PROFILES[model] ?? MODEL_PROFILES.instinct).temperature;
  switch (creativity) {
    case "exact":
      return 0.25;
    case "vivid":
      return Math.min(1.25, Number((base + 0.25).toFixed(2)));
    case "chaos":
      return 1.4;
    case "balance":
    default:
      return base;
  }
}

export function buildPersonalizationDirective(opts: {
  aiStyle?: string;
  aiLength?: string;
}): string {
  const blocks: string[] = [];
  const style = (opts.aiStyle || "").trim().slice(0, 1200);
  if (style) {
    blocks.push(`USER COMMUNICATION STYLE PREFERENCE:\n${style}`);
  }
  switch (opts.aiLength) {
    case "short":
      blocks.push("USER RESPONSE LENGTH PREFERENCE: Keep answers concise and direct (~1-3 sentences unless code or detailed breakdown is explicitly required).");
      break;
    case "medium":
      blocks.push("USER RESPONSE LENGTH PREFERENCE: Balanced medium length (~1 focused paragraph or compact structured answer).");
      break;
    case "long":
      blocks.push("USER RESPONSE LENGTH PREFERENCE: Provide thorough, detailed explanations with context and examples.");
      break;
    case "unlimited":
      blocks.push("USER RESPONSE LENGTH PREFERENCE: Full comprehensive longform depth without cutting short.");
      break;
    default:
      break;
  }
  return blocks.length > 0 ? `\n\n${blocks.join("\n\n")}` : "";
}

// Cooldown when direct api.deepseek.com responds with 401/402/403 (e.g. Insufficient Balance)
// so requests route straight to ApiMira without wasting extra latency every turn.
const BALANCE_COOLDOWN_MS = 30 * 60_000;

export function shouldTryDirectDeepSeek(deepseekKey: string, apimiraKey: string): boolean {
  if (!deepseekKey) return false;
  if (!apimiraKey) return true;
  return Date.now() >= getHealthStore().directBalanceCooldownUntil;
}

export function markDirectDeepSeekUnavailable(status: number): void {
  if (status === 401 || status === 402 || status === 403) {
    getHealthStore().directBalanceCooldownUntil = Date.now() + BALANCE_COOLDOWN_MS;
  }
}

/**
 * Lightweight background health check executed once at server startup so dead 402/502 shards
 * are detected before the first user prompt arrives (eliminating 1.5-3.5s cold-start waterfall).
 * Only marks endpoints that actively reply with 401/402/403 or 502/503/504/429.
 */
export function prewarmDeepSeekProviderHealth(
  deepseekKey: string,
  apimiraKey: string,
  apimiraBaseUrl: string,
): Promise<void> {
  const store = getHealthStore();
  const now = Date.now();
  if (store.prewarmInFlight) return store.prewarmInFlight;
  if (now - store.prewarmLastAt < 10 * 60_000) return Promise.resolve();
  store.prewarmLastAt = now;

  const base = apimiraBaseUrl.trim().replace(/\/+$/, "");
  const tasks: Promise<void>[] = [];

  if (deepseekKey && apimiraKey && shouldTryDirectDeepSeek(deepseekKey, apimiraKey)) {
    tasks.push(
      fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_DIRECT_CHAT,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
        signal: AbortSignal.timeout(3500),
      })
        .then(async (res) => {
          if (!res.ok) markDirectDeepSeekUnavailable(res.status);
          try {
            await res.body?.cancel();
          } catch {}
        })
        .catch(() => {}),
    );
  }

  if (apimiraKey && base) {
    for (const modelId of [APIMIRA_DEEPSEEK_INSTINCT, APIMIRA_DEEPSEEK_F1]) {
      tasks.push(
        fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apimiraKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            max_tokens: 1,
            ...APIMIRA_NO_REASONING_PARAMS,
            messages: [{ role: "user", content: "hi" }],
          }),
          signal: AbortSignal.timeout(3500),
        })
          .then(async (res) => {
            if (res.ok) markApimiraModelHealthy(modelId);
            else markApimiraModelUnhealthy(modelId, res.status);
            try {
              await res.body?.cancel();
            } catch {}
          })
          .catch(() => {}),
      );
    }
  }

  store.prewarmInFlight = Promise.allSettled(tasks).then(() => {
    store.prewarmInFlight = null;
  });
  return store.prewarmInFlight;
}

export function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host) return false;
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
      return false;
    }
    const m172 = host.match(/^172\.(\d{1,3})\./);
    if (m172) {
      const second = Number(m172[1]);
      if (second >= 16 && second <= 31) return false;
    }
    if (/^(fc|fd|fe80:)/i.test(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
