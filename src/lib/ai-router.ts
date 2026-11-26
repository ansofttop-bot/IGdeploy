import {
  APIMIRA_NO_REASONING_PARAMS,
  DEEPSEEK_DIRECT_CHAT,
  DEEPSEEK_DIRECT_REASONER,
  getApimiraFallbackChain,
  markApimiraModelHealthy,
  markApimiraModelUnhealthy,
  markDirectDeepSeekUnavailable,
  shouldTryDirectDeepSeek,
  type UiModel,
} from "./deepseek-models";
import {
  GROQ_FREE_MODEL,
  callGroqFreeChatStream,
  callGroqFreeText,
  resolveGroqFreeModel,
} from "./groq-free";

export type AiTier = "free" | "pro";

interface CircuitBreakerState {
  failures: number;
  openUntilMs: number;
  lastError?: string;
}

function getBreakerRegistry(): Map<string, CircuitBreakerState> {
  const g = globalThis as typeof globalThis & {
    __igseekAiCircuitBreakers?: Map<string, CircuitBreakerState>;
  };
  if (!g.__igseekAiCircuitBreakers) {
    g.__igseekAiCircuitBreakers = new Map();
  }
  return g.__igseekAiCircuitBreakers;
}

export function isProviderCircuitOpen(providerId: string, now = Date.now()): boolean {
  const state = getBreakerRegistry().get(providerId);
  return Boolean(state && state.openUntilMs > now);
}

export function recordProviderSuccess(providerId: string): void {
  getBreakerRegistry().delete(providerId);
}

export function recordProviderFailure(
  providerId: string,
  statusOrReason: number | string,
  now = Date.now(),
): void {
  const reg = getBreakerRegistry();
  const prev = reg.get(providerId) || { failures: 0, openUntilMs: 0 };
  const failures = prev.failures + 1;

  const isBillingOrAuth = statusOrReason === 401 || statusOrReason === 402 || statusOrReason === 403;
  const threshold = isBillingOrAuth ? 1 : 2;
  const cooldownMs = isBillingOrAuth ? 5 * 60_000 : Math.min(180_000, 30_000 * failures);

  reg.set(providerId, {
    failures,
    openUntilMs: failures >= threshold ? now + cooldownMs : prev.openUntilMs,
    lastError: String(statusOrReason),
  });
}

export function resetAiCircuitBreakers(): void {
  getBreakerRegistry().clear();
}

export interface RouteChatStreamParams {
  tier: AiTier;
  modelId?: string;
  model?: string;
  messages: Array<Record<string, unknown>>;
  tools?: unknown[];
  hasVisionInput?: boolean;
  reasoning?: boolean;
  temperature?: number;
  maxTokens?: number;
  directDeepSeekKey?: string;
  apimiraKey?: string;
  apimiraBaseUrl?: string;
  signal?: AbortSignal;
}

export interface RoutedStreamResult {
  response: Response;
  providerId: string;
  modelUsed: string;
  tier: AiTier;
}

/**
 * Tier-isolated AI streaming router:
 * - Free tier: strictly Qwen 3.8 (`qwen/qwen3.8-27b`) via Groq for text, tools, and attachments.
 *   NEVER touches paid DeepSeek / ApiMira keys.
 * - Pro tier: strictly DeepSeek (< V4.0) via Direct DeepSeek -> ApiMira DeepSeek fallback chain.
 */
export async function routeChatStream(params: RouteChatStreamParams): Promise<RoutedStreamResult> {
  const temperature = params.temperature ?? 0.65;
  const maxTokens = params.maxTokens ?? 4096;
  const resolvedModelId = params.modelId ?? params.model ?? "instinct";

  if (params.tier === "free") {
    const modelUsed = resolveGroqFreeModel();
    const res = await callGroqFreeChatStream({
      messages: params.messages,
      tools: params.tools as any,
      reasoning: Boolean(params.reasoning),
      temperature,
      maxTokens,
      signal: params.signal,
    });
    return {
      response: res,
      providerId: "groq-free",
      modelUsed,
      tier: "free",
    };
  }

  // PRO TIER (strictly isolated DeepSeek < V4.0)
  const directKey = (params.directDeepSeekKey ?? process.env.DEEPSEEK_API_KEY ?? "").trim();
  const apimiraKey = (params.apimiraKey ?? process.env.APIMIRA_API_KEY ?? "").trim();
  const apimiraBase = (params.apimiraBaseUrl ?? process.env.APIMIRA_BASE_URL ?? "https://apimira.com/v1")
    .trim()
    .replace(/\/+$/, "");

  const errors: string[] = [];

  if (
    directKey &&
    shouldTryDirectDeepSeek(directKey, apimiraKey) &&
    !isProviderCircuitOpen("deepseek-direct")
  ) {
    const directModel = params.reasoning ? DEEPSEEK_DIRECT_REASONER : DEEPSEEK_DIRECT_CHAT;
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${directKey}`,
        },
        body: JSON.stringify({
          model: directModel,
          stream: true,
          ...(!params.reasoning ? { temperature } : {}),
          max_tokens: maxTokens,
          ...(params.tools && params.tools.length ? { tools: params.tools } : {}),
          messages: params.messages,
        }),
        signal: params.signal ?? AbortSignal.timeout(40_000),
      });
      if (res.ok && res.body) {
        recordProviderSuccess("deepseek-direct");
        return { response: res, providerId: "deepseek-direct", modelUsed: directModel, tier: "pro" };
      }
      markDirectDeepSeekUnavailable(res.status);
      recordProviderFailure("deepseek-direct", res.status);
      errors.push(`direct:${res.status}`);
    } catch (err: any) {
      if (params.signal?.aborted || err?.name === "AbortError") throw err;
      recordProviderFailure("deepseek-direct", err?.message || "network");
      errors.push(`direct:${err?.message || "err"}`);
    }
  }

  if (apimiraKey) {
    const uiModel: UiModel =
      resolvedModelId === "chat" || resolvedModelId === "f1" ? resolvedModelId : "instinct";
    const chain = getApimiraFallbackChain(uiModel, Boolean(params.reasoning));
    for (const modelName of chain) {
      const pid = `apimira:${modelName}`;
      if (isProviderCircuitOpen(pid)) continue;
      try {
        const res = await fetch(`${apimiraBase}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apimiraKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            stream: true,
            ...(!params.reasoning ? { temperature, ...APIMIRA_NO_REASONING_PARAMS } : {}),
            max_tokens: maxTokens,
            ...(params.tools && params.tools.length ? { tools: params.tools } : {}),
            messages: params.messages,
          }),
          signal: params.signal ?? AbortSignal.timeout(45_000),
        });
        if (res.ok && res.body) {
          markApimiraModelHealthy(modelName);
          recordProviderSuccess(pid);
          return { response: res, providerId: pid, modelUsed: modelName, tier: "pro" };
        }
        markApimiraModelUnhealthy(modelName, res.status);
        recordProviderFailure(pid, res.status);
        errors.push(`${pid}:${res.status}`);
      } catch (err: any) {
        if (params.signal?.aborted || err?.name === "AbortError") throw err;
        recordProviderFailure(pid, err?.message || "network");
        errors.push(`${pid}:${err?.message || "err"}`);
      }
    }
  }

  throw new Error(`All Pro AI providers unavailable (${errors.join(", ") || "no keys configured"})`);
}

export async function routeTextCompletion(params: {
  tier: AiTier;
  modelId?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}): Promise<{ text: string; providerId: string }> {
  const temperature = params.temperature ?? 0.3;
  const maxTokens = params.maxTokens ?? 1500;

  if (params.tier === "free") {
    const text =
      (await callGroqFreeText({
        messages: params.messages,
        maxTokens,
        temperature,
        jsonMode: params.jsonMode,
      })) || "";
    if (!text) throw new Error("Groq Qwen 3.8 Free text provider unavailable");
    return { text, providerId: "groq-free" };
  }

  const directKey = (process.env.DEEPSEEK_API_KEY || "").trim();
  const apimiraKey = (process.env.APIMIRA_API_KEY || "").trim();
  const apimiraBase = (process.env.APIMIRA_BASE_URL || "https://apimira.com/v1").trim().replace(/\/+$/, "");

  if (
    directKey &&
    shouldTryDirectDeepSeek(directKey, apimiraKey) &&
    !isProviderCircuitOpen("deepseek-direct")
  ) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${directKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_DIRECT_CHAT,
          temperature,
          max_tokens: maxTokens,
          ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
          messages: params.messages,
        }),
        signal: AbortSignal.timeout(params.timeoutMs ?? 25_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = json.choices?.[0]?.message?.content?.trim() || "";
        if (text) {
          recordProviderSuccess("deepseek-direct");
          return { text, providerId: "deepseek-direct" };
        }
      }
      markDirectDeepSeekUnavailable(res.status);
      recordProviderFailure("deepseek-direct", res.status);
    } catch (err: any) {
      recordProviderFailure("deepseek-direct", err?.message || "network");
    }
  }

  if (apimiraKey) {
    const uiModel: UiModel =
      params.modelId === "chat" || params.modelId === "instinct" ? params.modelId : "f1";
    for (const modelName of getApimiraFallbackChain(uiModel, false)) {
      const pid = `apimira:${modelName}`;
      if (isProviderCircuitOpen(pid)) continue;
      try {
        const res = await fetch(`${apimiraBase}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apimiraKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            temperature,
            max_tokens: maxTokens,
            ...APIMIRA_NO_REASONING_PARAMS,
            messages: params.messages,
          }),
          signal: AbortSignal.timeout(params.timeoutMs ?? 25_000),
        });
        if (res.ok) {
          const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const text = json.choices?.[0]?.message?.content?.trim() || "";
          if (text) {
            markApimiraModelHealthy(modelName);
            recordProviderSuccess(pid);
            return { text, providerId: pid };
          }
        }
        markApimiraModelUnhealthy(modelName, res.status);
        recordProviderFailure(pid, res.status);
      } catch (err: any) {
        recordProviderFailure(pid, err?.message || "network");
      }
    }
  }

  throw new Error("All Pro text providers unavailable");
}

export function getAiRouterHealthSummary() {
  const now = Date.now();
  const openCircuits: Array<{ providerId: string; retryAfterSec: number; lastError?: string }> = [];
  for (const [providerId, st] of getBreakerRegistry().entries()) {
    if (st.openUntilMs > now) {
      openCircuits.push({
        providerId,
        retryAfterSec: Math.ceil((st.openUntilMs - now) / 1000),
        lastError: st.lastError,
      });
    }
  }
  return {
    freeProvider: `groq-free (${GROQ_FREE_MODEL})`,
    proProvider: "deepseek (<4.0) + apimira",
    openCircuits,
  };
}
