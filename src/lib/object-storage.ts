import crypto from "node:crypto";
import path from "node:path";

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export function getS3StorageConfig(): S3StorageConfig | null {
  const endpoint = (process.env.S3_ENDPOINT || "").trim().replace(/\/+$/, "");
  const bucket = (process.env.S3_BUCKET || "").trim();
  const accessKeyId = (process.env.S3_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.S3_SECRET_ACCESS_KEY || "").trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    endpoint,
    region: (process.env.S3_REGION || "us-east-1").trim() || "us-east-1",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

export function isS3StorageConfigured(): boolean {
  return Boolean(getS3StorageConfig());
}

export function sanitizeOwnerSegment(ownerId: string): string {
  const clean = ownerId.replace(/[^a-zA-Z0-9._-]/g, "_").trim();
  if (!clean || clean === "." || clean === "..") {
    throw new Error("Invalid ownerId for object storage key");
  }
  return clean;
}

export function buildUserObjectKey(ownerId: string, fileId: string, filename: string): string {
  const safeOwner = sanitizeOwnerSegment(ownerId);
  const safeFileId = fileId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || crypto.randomUUID().replace(/-/g, "");
  const base = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file.bin";
  return `users/${safeOwner}/library/${safeFileId}_${base}`;
}

export function assertObjectKeyBelongsToUser(ownerId: string, objectKey: string): void {
  const safeOwner = sanitizeOwnerSegment(ownerId);
  const requiredPrefix = `users/${safeOwner}/`;
  if (!objectKey.startsWith(requiredPrefix) || objectKey.includes("..") || objectKey.includes("\\")) {
    throw new Error("Forbidden object key: tenant isolation violation");
  }
}

function sha256Hex(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeS3Path(key: string): string {
  return key
    .split("/")
    .map((seg) => encodeRfc3986(seg))
    .join("/");
}

/**
 * Generates an AWS Signature V4 presigned URL (GET / PUT / DELETE) compatible with
 * AWS S3, Cloudflare R2, Yandex Object Storage, Selectel S3, and MinIO.
 * Enforces strict tenant key prefix validation (`users/<ownerId>/...`).
 */
export function createSigV4PresignedUrl(params: {
  config: S3StorageConfig;
  method: "GET" | "PUT" | "DELETE";
  ownerId: string;
  objectKey: string;
  expiresSec?: number;
  contentType?: string;
  now?: Date;
}): { url: string; expiresAt: string; headers: Record<string, string> } {
  assertObjectKeyBelongsToUser(params.ownerId, params.objectKey);

  const cfg = params.config;
  const now = params.now ?? new Date();
  const expiresSec = Math.min(Math.max(30, Math.round(params.expiresSec ?? 300)), 3600);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;

  const parsedEndpoint = new URL(cfg.endpoint);
  const host = cfg.forcePathStyle
    ? parsedEndpoint.host
    : `${cfg.bucket}.${parsedEndpoint.host}`;

  const canonicalUri = cfg.forcePathStyle
    ? `/${encodeRfc3986(cfg.bucket)}/${encodeS3Path(params.objectKey)}`
    : `/${encodeS3Path(params.objectKey)}`;

  const signedHeadersList = ["host"];
  const canonicalHeadersLines = [`host:${host}`];
  const responseHeaders: Record<string, string> = {};

  if (params.method === "PUT" && params.contentType) {
    signedHeadersList.push("content-type");
    canonicalHeadersLines.push(`content-type:${params.contentType}`);
    responseHeaders["content-type"] = params.contentType;
  }

  signedHeadersList.sort();
  canonicalHeadersLines.sort();
  const signedHeaders = signedHeadersList.join(";");
  const canonicalHeaders = `${canonicalHeadersLines.join("\n")}\n`;

  const queryParams: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${cfg.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSec)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];
  queryParams.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const canonicalQuery = queryParams
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");

  const canonicalRequest = [
    params.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, cfg.region);
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const baseProto = parsedEndpoint.protocol;
  const url = `${baseProto}//${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  const expiresAt = new Date(now.getTime() + expiresSec * 1000).toISOString();

  return { url, expiresAt, headers: responseHeaders };
}

export async function uploadBufferToS3ForUser(params: {
  ownerId: string;
  objectKey: string;
  buffer: Buffer;
  contentType: string;
}): Promise<boolean> {
  const config = getS3StorageConfig();
  if (!config) return false;
  const signed = createSigV4PresignedUrl({
    config,
    method: "PUT",
    ownerId: params.ownerId,
    objectKey: params.objectKey,
    contentType: params.contentType,
    expiresSec: 180,
  });
  const res = await fetch(signed.url, {
    method: "PUT",
    headers: signed.headers,
    body: new Uint8Array(params.buffer),
    signal: AbortSignal.timeout(25_000),
  });
  return res.ok;
}

export async function deleteS3ObjectForUser(ownerId: string, objectKey: string): Promise<boolean> {
  const config = getS3StorageConfig();
  if (!config) return false;
  const signed = createSigV4PresignedUrl({
    config,
    method: "DELETE",
    ownerId,
    objectKey,
    expiresSec: 120,
  });
  const res = await fetch(signed.url, {
    method: "DELETE",
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok || res.status === 404;
}
