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
import { callMistralFreeChat, callMistralFreeText } from "./mistral-free";

export type AiTier = "free" | "pro";

export interface CustomAiProviderSpec {
  id: string;
  tier: AiTier;
  baseUrl: string;
  apiKey?: string;
  model: string;
  priority?: number;
  supportsVision?: boolean;
  timeoutMs?: number;
}

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

export function loadCustomAiProviders(tier: AiTier): CustomAiProviderSpec[] {
  const specs: CustomAiProviderSpec[] = [];

  // Built-in self-hosted OpenAI-compatible slots (vLLM / Ollama / SGLang / TGI)
  const selfHostedUrl = (
    tier === "free"
      ? process.env.SELF_HOSTED_FREE_LLM_URL || process.env.SELF_HOSTED_LLM_URL || ""
      : process.env.SELF_HOSTED_PRO_LLM_URL || ""
  )
    .trim()
    .replace(/\/+$/, "");

  if (selfHostedUrl) {
    specs.push({
      id: `self-hosted-${tier}`,
      tier,
      baseUrl: selfHostedUrl,
      apiKey: (process.env.SELF_HOSTED_LLM_API_KEY || "local-igseek").trim(),
      model: (
        tier === "free"
          ? process.env.SELF_HOSTED_FREE_LLM_MODEL || process.env.SELF_HOSTED_LLM_MODEL || "qwen2.5:14b"
          : process.env.SELF_HOSTED_PRO_LLM_MODEL || "deepseek-r1:32b"
      ).trim(),
      priority: 10,
      timeoutMs: 35_000,
    });
  }

  // Plug-in custom providers JSON array without code changes
  const rawJson = (process.env.AI_CUSTOM_PROVIDERS_JSON || "").trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (
            item &&
            typeof item.id === "string" &&
            typeof item.baseUrl === "string" &&
            typeof item.model === "string" &&
            (item.tier === tier || item.tier === "both")
          ) {
            specs.push({
              id: item.id,
              tier,
              baseUrl: item.baseUrl.replace(/\/+$/, ""),
              apiKey: typeof item.apiKey === "string" ? item.apiKey : undefined,
              model: item.model,
              priority: typeof item.priority === "number" ? item.priority : 50,
              supportsVision: Boolean(item.supportsVision),
              timeoutMs: typeof item.timeoutMs === "number" ? item.timeoutMs : 30_000,
            });
          }
        }
      }
    } catch {
      // Ignore invalid JSON so free/pro defaults remain healthy
    }
  }

  return specs.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));
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

async function callOpenAiCompatibleProvider(
  spec: CustomAiProviderSpec,
  params: {
    messages: Array<Record<string, unknown>>;
    tools?: unknown[];
    stream: boolean;
    temperature: number;
    maxTokens: number;
    jsonMode?: boolean;
    signal?: AbortSignal;
  },
): Promise<Response> {
  const url = spec.baseUrl.endsWith("/chat/completions")
    ? spec.baseUrl
    : `${spec.baseUrl}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (spec.apiKey) {
    headers.authorization = `Bearer ${spec.apiKey}`;
  }
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: spec.model,
      stream: params.stream,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      ...(params.tools && params.tools.length ? { tools: params.tools } : {}),
      ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: params.messages,
    }),
    signal: params.signal ?? AbortSignal.timeout(spec.timeoutMs ?? 30_000),
  });
}

/**
 * Tier-isolated AI streaming router:
 * - Free tier NEVER touches paid DeepSeek/APIMIRA keys — uses self-hosted free plugins -> Mistral Free -> Pollinations text fallback.
 * - Pro tier prioritizes cost-optimized Direct DeepSeek -> self-hosted Pro plugins -> APIMIRA resilient fallback chain.
 */
export async function routeChatStream(params: RouteChatStreamParams): Promise<RoutedStreamResult> {
  const temperature = params.temperature ?? 0.65;
  const maxTokens = params.maxTokens ?? 4096;
  const resolvedModelId = params.modelId ?? params.model ?? "instinct";

  if (params.tier === "free") {
    const customFree = loadCustomAiProviders("free");
    for (const provider of customFree) {
      if (isProviderCircuitOpen(provider.id)) continue;
      try {
        const res = await callOpenAiCompatibleProvider(provider, {
          messages: params.messages,
          tools: params.tools,
          stream: true,
          temperature,
          maxTokens,
          signal: params.signal,
        });
        if (res.ok && res.body) {
          recordProviderSuccess(provider.id);
          return { response: res, providerId: provider.id, modelUsed: provider.model, tier: "free" };
        }
        recordProviderFailure(provider.id, res.status);
      } catch (err: any) {
        recordProviderFailure(provider.id, err?.message || "network_error");
      }
    }

    const res = await callMistralFreeChat({
      messages: params.messages,
      tools: params.tools as any,
      hasVisionInput: params.hasVisionInput,
      temperature,
      maxTokens,
      signal: params.signal,
    });
    return {
      response: res,
      providerId: "mistral-free",
      modelUsed: "mistral-free",
      tier: "free",
    };
  }

  // PRO TIER (strictly isolated from free pool unless explicitly configured)
  const directKey = (params.directDeepSeekKey ?? process.env.DEEPSEEK_API_KEY ?? "").trim();
  const apimiraKey = (params.apimiraKey ?? process.env.APIMIRA_API_KEY ?? "").trim();
  const apimiraBase = (params.apimiraBaseUrl ?? process.env.APIMIRA_BASE_URL ?? "https://apimira.com/v1")
    .trim()
    .replace(/\/+$/, "");

  const errors: string[] = [];

  // 1. Cost-optimal Direct DeepSeek first when healthy
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
          temperature,
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
      recordProviderFailure("deepseek-direct", err?.message || "network");
      errors.push(`direct:${err?.message || "err"}`);
    }
  }

  // 2. Self-hosted / custom Pro plug-in providers
  for (const provider of loadCustomAiProviders("pro")) {
    if (isProviderCircuitOpen(provider.id)) continue;
    try {
      const res = await callOpenAiCompatibleProvider(provider, {
        messages: params.messages,
        tools: params.tools,
        stream: true,
        temperature,
        maxTokens,
        signal: params.signal,
      });
      if (res.ok && res.body) {
        recordProviderSuccess(provider.id);
        return { response: res, providerId: provider.id, modelUsed: provider.model, tier: "pro" };
      }
      recordProviderFailure(provider.id, res.status);
      errors.push(`${provider.id}:${res.status}`);
    } catch (err: any) {
      recordProviderFailure(provider.id, err?.message || "network");
      errors.push(`${provider.id}:${err?.message || "err"}`);
    }
  }

  // 3. APIMIRA resilient fallback chain
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
            temperature,
            max_tokens: maxTokens,
            ...(!params.reasoning ? APIMIRA_NO_REASONING_PARAMS : {}),
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
    for (const provider of loadCustomAiProviders("free")) {
      if (isProviderCircuitOpen(provider.id)) continue;
      try {
        const res = await callOpenAiCompatibleProvider(provider, {
          messages: params.messages,
          stream: false,
          temperature,
          maxTokens,
          jsonMode: params.jsonMode,
        });
        if (res.ok) {
          const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const text = json.choices?.[0]?.message?.content?.trim() || "";
          if (text) {
            recordProviderSuccess(provider.id);
            return { text, providerId: provider.id };
          }
        }
        recordProviderFailure(provider.id, res.status);
      } catch (err: any) {
        recordProviderFailure(provider.id, err?.message || "network");
      }
    }

    const text =
      (await callMistralFreeText({
        messages: params.messages,
        temperature,
        maxTokens,
        jsonMode: params.jsonMode,
        timeoutMs: params.timeoutMs ?? 24_000,
      })) || "";
    if (!text) throw new Error("Free text providers unavailable");
    return { text, providerId: "mistral-free" };
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
    freeCustomProviders: loadCustomAiProviders("free").map((p) => p.id),
    proCustomProviders: loadCustomAiProviders("pro").map((p) => p.id),
    openCircuits,
  };
}
