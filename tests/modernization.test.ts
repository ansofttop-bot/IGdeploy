import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { verifyFirebaseIdToken } from "../src/lib/auth-server";
import { clearIdempotencyStore, withIdempotentExecution } from "../src/lib/idempotency-server";
import {
  assertObjectKeyBelongsToUser,
  buildUserObjectKey,
  createSigV4PresignedUrl,
} from "../src/lib/object-storage";
import { buildSanitizedSandboxEnv, isWithinDirectory } from "../src/lib/flow-terminal";
import {
  getAiRouterHealthSummary,
  isProviderCircuitOpen,
  recordProviderFailure,
  recordProviderSuccess,
  resetAiCircuitBreakers,
} from "../src/lib/ai-router";
import { GROQ_FREE_MODEL } from "../src/lib/groq-free";
import {
  OPENROUTER_FREE_CHAT,
  OPENROUTER_FREE_F1,
  OPENROUTER_FREE_FALLBACK,
  OPENROUTER_FREE_INSTINCT,
  OPENROUTER_PRO_CHAT,
  OPENROUTER_PRO_F1,
  OPENROUTER_PRO_INSTINCT,
  OPENROUTER_PRO_REASONER,
  getOpenRouterFallbackChain,
  resolveOpenRouterModel,
} from "../src/lib/openrouter-deepseek";
import {
  APIMIRA_DEEPSEEK_CHAT,
  APIMIRA_DEEPSEEK_F1,
  APIMIRA_DEEPSEEK_INSTINCT,
  APIMIRA_DEEPSEEK_REASONER,
  DEEPSEEK_DIRECT_CHAT,
  DEEPSEEK_DIRECT_F1,
  DEEPSEEK_DIRECT_INSTINCT,
  DEEPSEEK_DIRECT_REASONER,
  getApimiraFallbackChain,
} from "../src/lib/deepseek-models";
import {
  PRO_HOURLY_PAID_IMAGE_LIMIT,
  PRO_HOURLY_WINDOW_MS,
  evaluateProHourlyImageRoute,
  recordProHourlyImageGeneration,
  resetProHourlyImageTracker,
} from "../src/lib/photo-limits-server";
import {
  PRO_LICENSE_KEY_HASHES,
  hashLicenseKey,
  isValidLicenseKeyFormat,
  normalizeLicenseKey,
} from "../src/lib/license-keys";
import {
  LicenseKeyError,
  PRO_DURATION_DAYS,
  redeemLicenseKey,
  resetLocalLicenseKeyTestState,
  signSubscriptionProof,
  verifySubscriptionProof,
} from "../src/lib/subscription-server";

function signTestJwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  kid = "test-kid-1",
): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = Buffer.from(`${header}.${body}`, "utf8");
  const signature = crypto.sign("RSA-SHA256", signingInput, privateKey).toString("base64url");
  return `${header}.${body}.${signature}`;
}

test("Auth: verifyFirebaseIdToken accepts valid RS256 token and rejects forged/expired tokens", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const projectId = "igseek-test-proj";
  const nowSec = Math.floor(Date.now() / 1000);
  const keyMap = new Map<string, crypto.KeyObject>([["test-kid-1", publicKey]]);

  const validToken = signTestJwt(
    {
      sub: "user_abc_123",
      email: "user@igseek.app",
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      iat: nowSec - 10,
      exp: nowSec + 3600,
    },
    privateKey,
  );

  const verified = await verifyFirebaseIdToken(validToken, {
    projectId,
    publicKeysOverride: keyMap,
    nowSec,
  });
  assert.equal(verified?.uid, "user_abc_123");
  assert.equal(verified?.email, "user@igseek.app");

  // Tampered payload must be rejected
  const parts = validToken.split(".");
  const tamperedPayload = Buffer.from(
    JSON.stringify({
      sub: "admin_forged",
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      iat: nowSec - 10,
      exp: nowSec + 3600,
    }),
  ).toString("base64url");
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
  assert.equal(
    await verifyFirebaseIdToken(tamperedToken, { projectId, publicKeysOverride: keyMap, nowSec }),
    null,
  );

  // Expired token must be rejected
  const expiredToken = signTestJwt(
    {
      sub: "user_abc_123",
      iss: `https://securetoken.google.com/${projectId}`,
      aud: projectId,
      iat: nowSec - 7200,
      exp: nowSec - 600,
    },
    privateKey,
  );
  assert.equal(
    await verifyFirebaseIdToken(expiredToken, { projectId, publicKeysOverride: keyMap, nowSec }),
    null,
  );
});

test("Idempotency: concurrent and sequential duplicate payment/API calls execute only once", async () => {
  clearIdempotencyStore();
  let executions = 0;

  const work = async () => {
    executions += 1;
    await new Promise((r) => setTimeout(r, 30));
    return { txnId: `txn_${executions}` };
  };

  const [a, b] = await Promise.all([
    withIdempotentExecution({ scope: "payment", actorId: "u1", key: "pay_001" }, work),
    withIdempotentExecution({ scope: "payment", actorId: "u1", key: "pay_001" }, work),
  ]);

  assert.equal(executions, 1);
  assert.equal(a.value.txnId, "txn_1");
  assert.equal(b.value.txnId, "txn_1");

  const c = await withIdempotentExecution({ scope: "payment", actorId: "u1", key: "pay_001" }, work);
  assert.equal(executions, 1);
  assert.equal(c.replayed, true);
  assert.equal(c.value.txnId, "txn_1");
});

test("Object Storage: S3 SigV4 presigned URLs enforce strict per-user tenant isolation", () => {
  const key = buildUserObjectKey("user_1", "file_99", "../../secret report.pdf");
  assert.ok(key.startsWith("users/user_1/library/"));
  assert.ok(!key.includes(".."));

  const signed = createSigV4PresignedUrl({
    config: {
      endpoint: "https://storage.yandexcloud.net",
      region: "ru-central1",
      bucket: "igseek-bucket",
      accessKeyId: "AKIA_TEST",
      secretAccessKey: "SECRET_TEST",
      forcePathStyle: true,
    },
    method: "PUT",
    ownerId: "user_1",
    objectKey: key,
    contentType: "application/pdf",
    expiresSec: 300,
  });

  assert.ok(signed.url.includes("X-Amz-Algorithm=AWS4-HMAC-SHA256"));
  assert.ok(signed.url.includes("X-Amz-Signature="));

  assert.throws(() => {
    assertObjectKeyBelongsToUser("user_2", key);
  }, /tenant isolation/i);
});

test("Flow Sandbox: strips server secrets from env and blocks prefix-sibling path traversal", () => {
  const env = buildSanitizedSandboxEnv(
    {
      PATH: "/usr/bin:/bin",
      DEEPSEEK_API_KEY: "sk-secret",
      GROQ_API_KEY: "gsk-secret",
      PLATEGA_SECRET_KEY: "platega-secret",
      POSTGRES_URL: "postgres://user:pass@host/db",
      S3_SECRET_ACCESS_KEY: "s3-secret",
      LANG: "en_US.UTF-8",
    },
    "/tmp/ws",
    "/tmp/ws/library",
  );

  assert.equal(env.DEEPSEEK_API_KEY, undefined);
  assert.equal(env.GROQ_API_KEY, undefined);
  assert.equal(env.PLATEGA_SECRET_KEY, undefined);
  assert.equal(env.POSTGRES_URL, undefined);
  assert.equal(env.S3_SECRET_ACCESS_KEY, undefined);
  assert.equal(env.HOME, "/tmp/ws");
  assert.equal(env.FLOW_LIBRARY_DIR, "/tmp/ws/library");

  assert.equal(isWithinDirectory("/tmp/ws/sub/file.txt", "/tmp/ws"), true);
  assert.equal(isWithinDirectory("/tmp/ws-evil/file.txt", "/tmp/ws"), false);
});

test("AI Router & OpenRouter DeepSeek < V4.0: circuit breaker works, Free & Pro use distinct pre-V4.0 DeepSeek models", () => {
  resetAiCircuitBreakers();
  recordProviderFailure("deepseek-direct", 402, 1000);
  assert.equal(isProviderCircuitOpen("deepseek-direct", 2000), true);

  recordProviderSuccess("deepseek-direct");
  assert.equal(isProviderCircuitOpen("deepseek-direct", 2000), false);

  assert.equal(GROQ_FREE_MODEL, "openai/gpt-oss-120b");
  const summary = getAiRouterHealthSummary();
  assert.ok(summary && typeof summary === "object");

  const openRouterFreeModels = [
    OPENROUTER_FREE_INSTINCT,
    OPENROUTER_FREE_CHAT,
    OPENROUTER_FREE_F1,
    OPENROUTER_FREE_FALLBACK,
    ...getOpenRouterFallbackChain("free", "instinct", false),
    ...getOpenRouterFallbackChain("free", "chat", false),
    ...getOpenRouterFallbackChain("free", "f1", false),
  ];
  const openRouterProModels = [
    OPENROUTER_PRO_INSTINCT,
    OPENROUTER_PRO_CHAT,
    OPENROUTER_PRO_F1,
    OPENROUTER_PRO_REASONER,
    ...getOpenRouterFallbackChain("pro", "instinct", false),
    ...getOpenRouterFallbackChain("pro", "chat", false),
    ...getOpenRouterFallbackChain("pro", "f1", false),
    ...getOpenRouterFallbackChain("pro", "instinct", true),
  ];

  assert.notEqual(
    resolveOpenRouterModel("free", "instinct"),
    resolveOpenRouterModel("pro", "instinct"),
  );
  assert.notEqual(
    resolveOpenRouterModel("free", "chat"),
    resolveOpenRouterModel("pro", "chat"),
  );
  assert.notEqual(
    resolveOpenRouterModel("free", "f1"),
    resolveOpenRouterModel("pro", "f1"),
  );

  for (const modelId of [...openRouterFreeModels, ...openRouterProModels]) {
    assert.match(modelId, /^deepseek\//, `Expected OpenRouter deepseek/* model, got ${modelId}`);
    assert.doesNotMatch(modelId, /v4/i, `OpenRouter DeepSeek model must be < V4.0, got ${modelId}`);
    assert.doesNotMatch(modelId, /latest$/i, `Must not use unpinned latest alias, got ${modelId}`);
  }

  const allProDeepSeekModels = [
    DEEPSEEK_DIRECT_INSTINCT,
    DEEPSEEK_DIRECT_CHAT,
    DEEPSEEK_DIRECT_F1,
    DEEPSEEK_DIRECT_REASONER,
    APIMIRA_DEEPSEEK_INSTINCT,
    APIMIRA_DEEPSEEK_CHAT,
    APIMIRA_DEEPSEEK_F1,
    APIMIRA_DEEPSEEK_REASONER,
    ...getApimiraFallbackChain("instinct", false),
    ...getApimiraFallbackChain("instinct", true),
  ];
  assert.ok(allProDeepSeekModels.length >= 8);
  for (const modelId of allProDeepSeekModels) {
    assert.doesNotMatch(modelId, /v4(\.|$)/i, `Pro DeepSeek model must be < V4.0, got ${modelId}`);
  }

  const chatRouteSrc = fs.readFileSync(path.resolve("src/routes/api/chat.ts"), "utf8");
  assert.doesNotMatch(chatRouteSrc, /generateImageWithGptImage2|editImageWithGptImage2/);
  assert.match(chatRouteSrc, /generateImageWithPollinations/);

  const aiRouterSrc = fs.readFileSync(path.resolve("src/lib/ai-router.ts"), "utf8");
  assert.doesNotMatch(aiRouterSrc, /callGroqFreeChatStream|callGroqFreeText/);

  const androidApiSrc = fs.readFileSync(
    path.resolve("android-app/app/src/main/java/app/igseek/mobile/data/api/IGseekApiClient.kt"),
    "utf8",
  );
  assert.doesNotMatch(androidApiSrc, /text\.pollinations\.ai/);
  assert.match(androidApiSrc, /image\.pollinations\.ai/);
});

test("Pro Image Anti-Abuse: allows 4 GPT Image 2 generations per sliding hour, then falls back to Pollinations and auto-recovers", () => {
  const actor = "pro-user-antiabuse-test";
  resetProHourlyImageTracker(actor);
  const t0 = 1_700_000_000_000;

  assert.equal(PRO_HOURLY_PAID_IMAGE_LIMIT, 4);

  // 4 generations within the hour use GPT Image 2
  for (let i = 0; i < 4; i++) {
    const route = evaluateProHourlyImageRoute(actor, t0 + i * 60_000);
    assert.equal(route.usePollinationsFallback, false);
    assert.equal(route.remainingPaid, 4 - i);
    recordProHourlyImageGeneration(actor, t0 + i * 60_000);
  }

  // 5th generation inside the rolling hour switches to Pollinations with user-facing notice info
  const blocked = evaluateProHourlyImageRoute(actor, t0 + 10 * 60_000);
  assert.equal(blocked.usePollinationsFallback, true);
  assert.equal(blocked.remainingPaid, 0);
  assert.ok(blocked.retryAfterMinutes >= 49 && blocked.retryAfterMinutes <= 51);
  assert.equal(blocked.resetAt, t0 + PRO_HOURLY_WINDOW_MS);

  // Pollinations fallback does NOT record GPT Image 2 timestamps; once oldest timestamp ages past 60m, GPT Image 2 automatically returns
  const recovered = evaluateProHourlyImageRoute(actor, t0 + PRO_HOURLY_WINDOW_MS + 1_000);
  assert.equal(recovered.usePollinationsFallback, false);
  assert.equal(recovered.remainingPaid, 1);

  resetProHourlyImageTracker(actor);
});

test("Subscription HMAC Proof: bound strictly to owner UID and rejects tampering", () => {
  const startedAt = Date.now();
  const expiresAt = startedAt + 86_400_000;
  const proof = signSubscriptionProof({
    uid: "uid_owner_1",
    plan: "pro",
    startedAt,
    expiresAt,
    txnId: "key_test_1",
  });
  assert.equal(verifySubscriptionProof(proof, "uid_owner_1")?.expiresAt, expiresAt);
  assert.equal(verifySubscriptionProof(proof, "uid_attacker_2"), null);
  assert.equal(verifySubscriptionProof(`${proof}x`, "uid_owner_1"), null);
});

test("License Keys: contains 45 unique SHA-256 hashes, activates 30-day Pro once, then permanently dies", async () => {
  assert.equal(PRO_LICENSE_KEY_HASHES.size, 45);
  for (const h of PRO_LICENSE_KEY_HASHES) {
    assert.match(h, /^[a-f0-9]{64}$/);
  }

  // Normalization & format check
  const testKey = "IGSK-ABCD-EFGH-2345";
  assert.equal(normalizeLicenseKey("  igskabcdefgh2345 "), testKey);
  assert.equal(isValidLicenseKeyFormat(testKey), true);
  assert.equal(isValidLicenseKeyFormat("IGSK-0000-1111-OOOO"), false);

  const testHash = hashLicenseKey(testKey);
  resetLocalLicenseKeyTestState(testHash);

  const allowedOverride = new Set([testHash]);
  const user1 = { id: "user_buyer_1", client: null, token: "fake.jwt.token", isJwt: true };
  const user2 = { id: "user_buyer_2", client: null, token: "fake.jwt.token", isJwt: true };

  // First activation succeeds -> 30 days of Pro
  const first = await redeemLicenseKey(user1, "  igsk-abcd-efgh-2345  ", {
    skipFirestore: true,
    extraAllowedHashes: allowedOverride,
  });
  assert.equal(first.redeemed, true);
  assert.equal(first.subscription.isPro, true);
  assert.equal(first.subscription.plan, "pro");
  assert.equal(first.subscription.durationDays, PRO_DURATION_DAYS);
  assert.equal(first.subscription.daysLeft, 30);

  // Second attempt by ANY user fails permanently with 409 (key is dead!)
  await assert.rejects(
    () =>
      redeemLicenseKey(user2, testKey, {
        skipFirestore: true,
        extraAllowedHashes: allowedOverride,
      }),
    (err: unknown) => err instanceof LicenseKeyError && err.status === 409,
  );

  // Unknown key fails with 400
  await assert.rejects(
    () =>
      redeemLicenseKey(user2, "IGSK-ZZZZ-YYYY-9999", {
        skipFirestore: true,
        extraAllowedHashes: allowedOverride,
      }),
    (err: unknown) => err instanceof LicenseKeyError && err.status === 400,
  );

  resetLocalLicenseKeyTestState(testHash);
});

test("PostgreSQL Migrations: UP and DOWN SQL files contain strict RLS and rollback", () => {
  const upSql = fs.readFileSync(path.resolve("migrations/001_library_and_payments_rls.sql"), "utf8");
  const downSql = fs.readFileSync(path.resolve("migrations/001_library_and_payments_rls.down.sql"), "utf8");

  assert.match(upSql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(upSql, /FORCE ROW LEVEL SECURITY/i);
  assert.match(upSql, /current_setting\('app\.current_user_id', true\)/i);
  assert.match(downSql, /DROP TABLE IF EXISTS library_files/i);
});
