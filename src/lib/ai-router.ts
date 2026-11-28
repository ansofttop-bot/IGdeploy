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
  OPENROUTER_FREE_INSTINCT,
  OPENROUTER_PRO_INSTINCT,
  OPENROUTER_PRO_REASONER,
  callOpenRouterDeepSeekStream,
  callOpenRouterDeepSeekText,
  isOpenRouterConfigured,
} from "./openrouter-deepseek";

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
 * Tiered DeepSeek (< V4.0) AI streaming router via OpenRouter:
 * - Free tier: lowest-cost DeepSeek < V4.0 models (`deepseek/deepseek-v3.2`, `deepseek/deepseek-v3.2-exp`, `deepseek/deepseek-chat-v3-0324`).
 * - Pro tier: stronger yet economical DeepSeek < V4.0 models (`deepseek/deepseek-v3.1-terminus`, `deepseek/deepseek-chat-v3.1`, `deepseek/deepseek-chat-v3-0324`, `deepseek/deepseek-r1-0528`).
 * Never silently downgrades to OpenAI / ChatGPT models.
 */
export async function routeChatStream(params: RouteChatStreamParams): Promise<RoutedStreamResult> {
  const temperature = params.temperature ?? 0.65;
  const maxTokens = params.maxTokens ?? 4096;
  const resolvedModelId = params.modelId ?? params.model ?? "instinct";
  const uiModel: UiModel =
    resolvedModelId === "chat" || resolvedModelId === "f1" ? resolvedModelId : "instinct";

  if (params.tier === "free") {
    let openRouterErr: unknown = null;
    if (isOpenRouterConfigured() && !isProviderCircuitOpen("openrouter-free")) {
      try {
        const res = await callOpenRouterDeepSeekStream({
          tier: "free",
          uiModel,
          messages: params.messages,
          tools: params.tools as any,
          reasoning: Boolean(params.reasoning),
          temperature,
          maxTokens,
          signal: params.signal,
        });
        recordProviderSuccess("openrouter-free");
        return {
          response: res.response,
          providerId: "openrouter-free",
          modelUsed: res.modelUsed,
          tier: "free",
        };
      } catch (err: any) {
        if (params.signal?.aborted || err?.name === "AbortError") throw err;
        openRouterErr = err;
        recordProviderFailure("openrouter-free", err?.message || "err");
      }
    }

    if (openRouterErr instanceof Error) throw openRouterErr;
    if (isProviderCircuitOpen("openrouter-free")) {
      throw new Error("IGseek AI is temporarily busy. Please try again in a few seconds.");
    }
    throw new Error("IGseek AI service is temporarily unavailable.");
  }

  // PRO TIER (OpenRouter DeepSeek < V4.0 primary -> Direct DeepSeek -> ApiMira DeepSeek)
  const errors: string[] = [];

  if (isOpenRouterConfigured() && !isProviderCircuitOpen("openrouter-pro")) {
    try {
      const res = await callOpenRouterDeepSeekStream({
        tier: "pro",
        uiModel,
        messages: params.messages,
        tools: params.tools as any,
        reasoning: Boolean(params.reasoning),
        temperature,
        maxTokens,
        signal: params.signal,
      });
      recordProviderSuccess("openrouter-pro");
      return {
        response: res.response,
        providerId: "openrouter-pro",
        modelUsed: res.modelUsed,
        tier: "pro",
      };
    } catch (err: any) {
      if (params.signal?.aborted || err?.name === "AbortError") throw err;
      recordProviderFailure("openrouter-pro", err?.message || "err");
      errors.push(`openrouter:${err?.message || "err"}`);
    }
  }

  const directKey = (params.directDeepSeekKey ?? process.env.DEEPSEEK_API_KEY ?? "").trim();
  const apimiraKey = (params.apimiraKey ?? process.env.APIMIRA_API_KEY ?? "").trim();
  const apimiraBase = (params.apimiraBaseUrl ?? process.env.APIMIRA_BASE_URL ?? "https://apimira.com/v1")
    .trim()
    .replace(/\/+$/, "");

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

  throw new Error("IGseek Pro AI is temporarily unavailable. Please try again shortly.");
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
  const uiModel: UiModel =
    params.modelId === "chat" || params.modelId === "f1" ? params.modelId : "instinct";

  if (isOpenRouterConfigured()) {
    const text = await callOpenRouterDeepSeekText({
      tier: params.tier,
      uiModel,
      messages: params.messages,
      maxTokens,
      temperature,
      jsonMode: params.jsonMode,
      timeoutMs: params.timeoutMs,
    });
    if (text) {
      return { text, providerId: params.tier === "free" ? "openrouter-free" : "openrouter-pro" };
    }
  }

  if (params.tier === "free") {
    throw new Error("IGseek AI is temporarily unavailable. Please try again shortly.");
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
    const apimiraModel: UiModel =
      params.modelId === "chat" || params.modelId === "instinct" ? params.modelId : "f1";
    for (const modelName of getApimiraFallbackChain(apimiraModel, false)) {
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

  throw new Error("IGseek Pro AI is temporarily unavailable.");
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
    freeProvider: isOpenRouterConfigured()
      ? `openrouter-free (${OPENROUTER_FREE_INSTINCT})`
      : "openrouter-free (OPENROUTER_API_KEY missing)",
    proProvider: isOpenRouterConfigured()
      ? `openrouter-pro (${OPENROUTER_PRO_INSTINCT}, ${OPENROUTER_PRO_REASONER})`
      : "deepseek (<4.0) + apimira",
    openCircuits,
  };
}
