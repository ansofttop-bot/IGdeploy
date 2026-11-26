import crypto from "node:crypto";
import { isPostgresConfigured, withUserRlsTransaction } from "../db/postgres";
import {
  assertObjectKeyBelongsToUser,
  buildUserObjectKey,
  createSigV4PresignedUrl,
  deleteS3ObjectForUser,
  getS3StorageConfig,
  isS3StorageConfigured,
} from "./object-storage";

export interface PgLibraryRecord {
  id: string;
  name: string;
  type: "image" | "doc" | "artifact";
  mimeType: string;
  size: number;
  source: "flow" | "user_upload" | "generated" | "artifact" | "library";
  chatTitle: string;
  createdAt: string;
  updatedAt: string;
  storageKey?: string | null;
  storageBucket?: string | null;
  downloadUrl?: string;
  content?: string;
  dataUrl?: string;
}

export function isPgLibraryEnabled(): boolean {
  return isPostgresConfigured();
}

function mapRow(row: Record<string, any>, ownerId: string): PgLibraryRecord {
  const s3 = getS3StorageConfig();
  let downloadUrl: string | undefined;
  if (s3 && typeof row.object_key === "string" && row.object_key) {
    try {
      downloadUrl = createSigV4PresignedUrl({
        config: s3,
        method: "GET",
        ownerId,
        objectKey: row.object_key,
        expiresSec: 900,
      }).url;
    } catch {
      downloadUrl = undefined;
    }
  }
  return {
    id: String(row.id),
    name: String(row.name),
    type: (row.file_type || "doc") as PgLibraryRecord["type"],
    mimeType: String(row.mime_type || "application/octet-stream"),
    size: Number(row.size_bytes || 0),
    source: (row.source || "library") as PgLibraryRecord["source"],
    chatTitle: String(row.chat_title || "Library"),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    storageKey: row.object_key || null,
    storageBucket: row.storage_bucket || null,
    ...(downloadUrl ? { downloadUrl } : {}),
    ...(typeof row.inline_content === "string" ? { content: row.inline_content } : {}),
    ...(typeof row.inline_data_url === "string" ? { dataUrl: row.inline_data_url } : {}),
  };
}

export async function listLibraryFilesPg(ownerId: string): Promise<PgLibraryRecord[]> {
  return withUserRlsTransaction(ownerId, async (client) => {
    const res = await client.query(
      `SELECT id, name, file_type, mime_type, size_bytes, source, chat_title,
              object_key, storage_bucket, inline_content, inline_data_url,
              created_at, updated_at
       FROM library_files
       WHERE deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 300`,
    );
    return res.rows.map((r) => mapRow(r, ownerId));
  });
}

export async function upsertLibraryFilePg(
  ownerId: string,
  input: {
    id?: string;
    name: string;
    type?: "image" | "doc" | "artifact";
    mimeType?: string;
    size?: number;
    source?: "flow" | "user_upload" | "generated" | "artifact" | "library";
    chatTitle?: string;
    objectKey?: string | null;
    storageBucket?: string | null;
    content?: string;
    dataUrl?: string;
  },
): Promise<PgLibraryRecord> {
  const id = input.id?.trim() || `lib_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const objectKey = input.objectKey || buildUserObjectKey(ownerId, id, input.name);
  assertObjectKeyBelongsToUser(ownerId, objectKey);

  return withUserRlsTransaction(ownerId, async (client) => {
    const res = await client.query(
      `INSERT INTO library_files (
         id, owner_id, name, file_type, mime_type, size_bytes, source, chat_title,
         object_key, storage_bucket, inline_content, inline_data_url, upload_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ready')
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         file_type = EXCLUDED.file_type,
         mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes,
         source = EXCLUDED.source,
         chat_title = EXCLUDED.chat_title,
         object_key = EXCLUDED.object_key,
         storage_bucket = EXCLUDED.storage_bucket,
         inline_content = COALESCE(EXCLUDED.inline_content, library_files.inline_content),
         inline_data_url = COALESCE(EXCLUDED.inline_data_url, library_files.inline_data_url),
         upload_status = 'ready',
         deleted_at = NULL,
         updated_at = NOW()
       RETURNING id, name, file_type, mime_type, size_bytes, source, chat_title,
                 object_key, storage_bucket, inline_content, inline_data_url,
                 created_at, updated_at`,
      [
        id,
        ownerId,
        input.name.slice(0, 260),
        input.type || "doc",
        (input.mimeType || "application/octet-stream").slice(0, 120),
        Math.max(0, Number(input.size || 0)),
        input.source || "library",
        (input.chatTitle || "Library").slice(0, 200),
        objectKey,
        input.storageBucket || getS3StorageConfig()?.bucket || "inline",
        input.content ?? null,
        input.dataUrl ?? null,
      ],
    );
    return mapRow(res.rows[0], ownerId);
  });
}

export async function createPresignedUploadPg(
  ownerId: string,
  input: {
    name: string;
    mimeType: string;
    size: number;
    type?: "image" | "doc" | "artifact";
    source?: "flow" | "user_upload" | "generated" | "artifact" | "library";
    chatTitle?: string;
  },
): Promise<{
  fileId: string;
  objectKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
} | null> {
  const s3 = getS3StorageConfig();
  if (!s3 || !isS3StorageConfigured()) return null;

  const fileId = `lib_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const objectKey = buildUserObjectKey(ownerId, fileId, input.name);

  await withUserRlsTransaction(ownerId, async (client) => {
    await client.query(
      `INSERT INTO library_files (
         id, owner_id, name, file_type, mime_type, size_bytes, source, chat_title,
         object_key, storage_bucket, upload_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')`,
      [
        fileId,
        ownerId,
        input.name.slice(0, 260),
        input.type || (input.mimeType.startsWith("image/") ? "image" : "doc"),
        input.mimeType.slice(0, 120),
        Math.max(0, Number(input.size || 0)),
        input.source || "user_upload",
        (input.chatTitle || "Library").slice(0, 200),
        objectKey,
        s3.bucket,
      ],
    );
  });

  const signed = createSigV4PresignedUrl({
    config: s3,
    method: "PUT",
    ownerId,
    objectKey,
    contentType: input.mimeType,
    expiresSec: 300,
  });

  return {
    fileId,
    objectKey,
    uploadUrl: signed.url,
    headers: signed.headers,
    expiresAt: signed.expiresAt,
  };
}

export async function confirmPresignedUploadPg(
  ownerId: string,
  fileId: string,
): Promise<PgLibraryRecord | null> {
  return withUserRlsTransaction(ownerId, async (client) => {
    const res = await client.query(
      `UPDATE library_files
       SET upload_status = 'ready', updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id, name, file_type, mime_type, size_bytes, source, chat_title,
                 object_key, storage_bucket, inline_content, inline_data_url,
                 created_at, updated_at`,
      [fileId],
    );
    if (res.rowCount === 0) return null;
    return mapRow(res.rows[0], ownerId);
  });
}

export async function getPresignedDownloadPg(
  ownerId: string,
  fileId: string,
): Promise<{ url: string; expiresAt: string; name: string; mimeType: string } | null> {
  const s3 = getS3StorageConfig();
  if (!s3) return null;

  const row = await withUserRlsTransaction(ownerId, async (client) => {
    const res = await client.query(
      `SELECT name, mime_type, object_key
       FROM library_files
       WHERE id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [fileId],
    );
    return res.rows[0] || null;
  });

  if (!row || !row.object_key) return null;
  const signed = createSigV4PresignedUrl({
    config: s3,
    method: "GET",
    ownerId,
    objectKey: String(row.object_key),
    expiresSec: 600,
  });
  return {
    url: signed.url,
    expiresAt: signed.expiresAt,
    name: String(row.name),
    mimeType: String(row.mime_type || "application/octet-stream"),
  };
}

export async function deleteLibraryFilePg(ownerId: string, fileId: string): Promise<boolean> {
  const deletedKey = await withUserRlsTransaction(ownerId, async (client) => {
    const res = await client.query(
      `UPDATE library_files
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING object_key`,
      [fileId],
    );
    return res.rows[0]?.object_key ? String(res.rows[0].object_key) : null;
  });

  if (!deletedKey) return false;
  if (isS3StorageConfigured()) {
    await deleteS3ObjectForUser(ownerId, deletedKey).catch(() => false);
  }
  return true;
}
