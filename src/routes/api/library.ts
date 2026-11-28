import { z } from "zod";
import {
  deleteCloudLibraryItemServer,
  deleteLocalLibraryItem,
  listAllLibraryFilesServer,
  upsertCloudLibraryItemServer,
  upsertLocalLibraryItem,
} from "../../lib/library-server";
import {
  confirmPresignedUploadPg,
  createPresignedUploadPg,
  deleteLibraryFilePg,
  getPresignedDownloadPg,
  isPgLibraryEnabled,
  listLibraryFilesPg,
  upsertLibraryFilePg,
} from "../../lib/library-pg";
import { getUserFromToken } from "../../lib/memory-server";
import { sanitizeErrorForUser } from "../../lib/error-sanitizer";

function bearer(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const UpsertSchema = z.object({
  id: z.string().max(128).optional(),
  name: z.string().min(1).max(260),
  type: z.enum(["image", "doc", "artifact"]).optional().default("doc"),
  mimeType: z.string().max(120).optional().default("text/plain"),
  content: z.string().max(850_000).optional(),
  dataUrl: z.string().max(1_200_000).optional(),
  size: z.number().optional(),
  source: z.enum(["flow", "user_upload", "generated", "artifact", "library"]).optional().default("library"),
  chatTitle: z.string().max(200).optional(),
});

const PresignUploadSchema = z.object({
  action: z.literal("presign_upload"),
  name: z.string().min(1).max(260),
  mimeType: z.string().max(120).optional().default("application/octet-stream"),
  size: z.number().min(0).max(50 * 1024 * 1024).optional().default(0),
  type: z.enum(["image", "doc", "artifact"]).optional(),
  source: z.enum(["flow", "user_upload", "generated", "artifact", "library"]).optional().default("user_upload"),
  chatTitle: z.string().max(200).optional(),
});

const ConfirmUploadSchema = z.object({
  action: z.literal("confirm_upload"),
  fileId: z.string().min(1).max(128),
});

const DeleteSchema = z.object({
  id: z.string().min(1).max(260),
});

export async function handleLibraryRequest(request: Request): Promise<Response> {
  const token = bearer(request);
  const authed = token ? await getUserFromToken(token) : null;
  if (!authed) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const usePg = isPgLibraryEnabled();

  if (request.method === "GET") {
    try {
      const url = new URL(request.url);
      if (url.searchParams.get("action") === "download") {
        const fileId = (url.searchParams.get("id") || "").trim();
        if (!fileId) return jsonResponse({ error: "Missing id" }, 400);
        if (!usePg) {
          return jsonResponse({ error: "IGseek cloud download is not available right now" }, 404);
        }
        const dl = await getPresignedDownloadPg(authed.id, fileId);
        if (!dl) return jsonResponse({ error: "File not found" }, 404);
        return jsonResponse(dl);
      }

      if (usePg) {
        const items = await listLibraryFilesPg(authed.id);
        return jsonResponse({ items, storageBackend: "postgres_rls" });
      }
      const items = await listAllLibraryFilesServer(authed, [], { bypassCache: true });
      return jsonResponse({ items, storageBackend: "firestore_fallback" });
    } catch (err: any) {
      return jsonResponse({ error: sanitizeErrorForUser(err?.message, "Failed to load IGseek library") }, 500);
    }
  }

  if (request.method === "POST") {
    let rawBody: Record<string, unknown>;
    try {
      rawBody = (await request.json()) as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON payload" }, 400);
    }

    if (rawBody?.action === "presign_upload") {
      if (!usePg) {
        return jsonResponse({ presigned: false, reason: "postgres_not_configured" });
      }
      let parsed: z.infer<typeof PresignUploadSchema>;
      try {
        parsed = PresignUploadSchema.parse(rawBody);
      } catch {
        return jsonResponse({ error: "Invalid presign_upload payload" }, 400);
      }
      const signed = await createPresignedUploadPg(authed.id, parsed);
      if (!signed) {
        return jsonResponse({ presigned: false, reason: "s3_not_configured" });
      }
      return jsonResponse({ presigned: true, ...signed });
    }

    if (rawBody?.action === "confirm_upload") {
      if (!usePg) {
        return jsonResponse({ error: "PostgreSQL not configured" }, 400);
      }
      let parsed: z.infer<typeof ConfirmUploadSchema>;
      try {
        parsed = ConfirmUploadSchema.parse(rawBody);
      } catch {
        return jsonResponse({ error: "Invalid confirm_upload payload" }, 400);
      }
      const item = await confirmPresignedUploadPg(authed.id, parsed.fileId);
      if (!item) return jsonResponse({ error: "Upload not found" }, 404);
      const items = await listLibraryFilesPg(authed.id);
      return jsonResponse({ item, items });
    }

    let body: z.infer<typeof UpsertSchema>;
    try {
      body = UpsertSchema.parse(rawBody);
    } catch {
      return jsonResponse({ error: "Invalid library file payload" }, 400);
    }

    if (usePg) {
      const saved = await upsertLibraryFilePg(authed.id, body);
      const items = await listLibraryFilesPg(authed.id);
      return jsonResponse({ item: saved, items });
    }

    const saved = upsertLocalLibraryItem(authed.id, body);
    await upsertCloudLibraryItemServer(authed, saved);
    const items = await listAllLibraryFilesServer(authed, [], { bypassCache: true });
    return jsonResponse({ item: saved, items });
  }

  if (request.method === "DELETE") {
    let body: z.infer<typeof DeleteSchema>;
    try {
      body = DeleteSchema.parse(await request.json());
    } catch {
      return jsonResponse({ error: "Bad request" }, 400);
    }
    if (usePg) {
      const pgOk = await deleteLibraryFilePg(authed.id, body.id);
      return jsonResponse({ ok: pgOk });
    }
    const localOk = deleteLocalLibraryItem(authed.id, body.id);
    const cloudOk = await deleteCloudLibraryItemServer(authed, body.id);
    return jsonResponse({ ok: localOk || cloudOk });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}
