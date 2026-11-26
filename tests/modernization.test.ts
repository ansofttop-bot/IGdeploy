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
  isProviderCircuitOpen,
  loadCustomAiProviders,
  recordProviderFailure,
  recordProviderSuccess,
  resetAiCircuitBreakers,
} from "../src/lib/ai-router";
import { signSubscriptionProof, verifySubscriptionProof } from "../src/lib/subscription-server";

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
      PLATEGA_SECRET_KEY: "platega-secret",
      POSTGRES_URL: "postgres://user:pass@host/db",
      S3_SECRET_ACCESS_KEY: "s3-secret",
      LANG: "en_US.UTF-8",
    },
    "/tmp/ws",
    "/tmp/ws/library",
  );

  assert.equal(env.DEEPSEEK_API_KEY, undefined);
  assert.equal(env.PLATEGA_SECRET_KEY, undefined);
  assert.equal(env.POSTGRES_URL, undefined);
  assert.equal(env.S3_SECRET_ACCESS_KEY, undefined);
  assert.equal(env.HOME, "/tmp/ws");
  assert.equal(env.FLOW_LIBRARY_DIR, "/tmp/ws/library");

  assert.equal(isWithinDirectory("/tmp/ws/sub/file.txt", "/tmp/ws"), true);
  assert.equal(isWithinDirectory("/tmp/ws-evil/file.txt", "/tmp/ws"), false);
});

test("AI Router: circuit breaker opens on billing/transient errors and isolates Free vs Pro", () => {
  resetAiCircuitBreakers();
  recordProviderFailure("deepseek-direct", 402, 1000);
  assert.equal(isProviderCircuitOpen("deepseek-direct", 2000), true);

  recordProviderSuccess("deepseek-direct");
  assert.equal(isProviderCircuitOpen("deepseek-direct", 2000), false);

  const prev = process.env.AI_CUSTOM_PROVIDERS_JSON;
  try {
    process.env.AI_CUSTOM_PROVIDERS_JSON = JSON.stringify([
      { id: "custom-free-1", tier: "free", baseUrl: "http://localhost:11434/v1", model: "qwen2.5:7b" },
      { id: "custom-pro-1", tier: "pro", baseUrl: "http://localhost:8000/v1", model: "deepseek-r1:32b" },
    ]);
    const freeList = loadCustomAiProviders("free");
    const proList = loadCustomAiProviders("pro");
    assert.ok(freeList.some((p) => p.id === "custom-free-1"));
    assert.ok(!freeList.some((p) => p.id === "custom-pro-1"));
    assert.ok(proList.some((p) => p.id === "custom-pro-1"));
    assert.ok(!proList.some((p) => p.id === "custom-free-1"));
  } finally {
    if (prev === undefined) delete process.env.AI_CUSTOM_PROVIDERS_JSON;
    else process.env.AI_CUSTOM_PROVIDERS_JSON = prev;
  }
});

test("Subscription HMAC Proof: bound strictly to owner UID and rejects tampering", () => {
  const startedAt = Date.now();
  const expiresAt = startedAt + 86_400_000;
  const proof = signSubscriptionProof({
    uid: "uid_owner_1",
    plan: "pro",
    startedAt,
    expiresAt,
    txnId: "txn_test_1",
  });
  assert.equal(verifySubscriptionProof(proof, "uid_owner_1")?.expiresAt, expiresAt);
  assert.equal(verifySubscriptionProof(proof, "uid_attacker_2"), null);
  assert.equal(verifySubscriptionProof(`${proof}x`, "uid_owner_1"), null);
});

test("PostgreSQL Migrations: UP and DOWN SQL files contain strict RLS and rollback", () => {
  const upSql = fs.readFileSync(path.resolve("migrations/001_library_and_payments_rls.sql"), "utf8");
  const downSql = fs.readFileSync(path.resolve("migrations/001_library_and_payments_rls.down.sql"), "utf8");

  assert.match(upSql, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(upSql, /FORCE ROW LEVEL SECURITY/i);
  assert.match(upSql, /current_setting\('app\.current_user_id', true\)/i);
  assert.match(downSql, /DROP TABLE IF EXISTS library_files/i);
});
