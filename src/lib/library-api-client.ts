export interface UploadLibraryResult {
  item: {
    id: string;
    name: string;
    type: "image" | "doc" | "artifact";
    mimeType: string;
    size?: number;
    downloadUrl?: string;
    storageKey?: string;
  };
}

/**
 * Modular Web client for IGseek Library API.
 * Attempts presigned direct-to-S3 upload when PostgreSQL + S3 are enabled on the server,
 * and falls back transparently to JSON upload when running in lightweight/Firestore mode.
 */
export async function uploadFileToLibrarySmart(params: {
  token: string;
  file: File;
  chatTitle?: string;
  source?: "flow" | "user_upload" | "generated" | "artifact" | "library";
}): Promise<UploadLibraryResult> {
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${params.token}`,
  };
  const mimeType = params.file.type || "application/octet-stream";
  const fileType: "image" | "doc" | "artifact" = mimeType.startsWith("image/") ? "image" : "doc";

  // 1. Try presigned direct S3 upload
  const presignRes = await fetch("/api/library", {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "presign_upload",
      name: params.file.name,
      mimeType,
      size: params.file.size,
      type: fileType,
      source: params.source || "user_upload",
      chatTitle: params.chatTitle || "Library",
    }),
  });

  if (presignRes.ok) {
    const presignJson = (await presignRes.json()) as {
      presigned?: boolean;
      fileId?: string;
      uploadUrl?: string;
      headers?: Record<string, string>;
    };
    if (presignJson.presigned && presignJson.uploadUrl && presignJson.fileId) {
      const putRes = await fetch(presignJson.uploadUrl, {
        method: "PUT",
        headers: presignJson.headers || { "content-type": mimeType },
        body: params.file,
      });
      if (!putRes.ok) {
        throw new Error(`Direct object storage upload failed (HTTP ${putRes.status})`);
      }
      const confirmRes = await fetch("/api/library", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "confirm_upload",
          fileId: presignJson.fileId,
        }),
      });
      if (!confirmRes.ok) {
        throw new Error(`Upload confirmation failed (HTTP ${confirmRes.status})`);
      }
      return (await confirmRes.json()) as UploadLibraryResult;
    }
  }

  // 2. Transparent fallback to standard JSON upload
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(params.file);
  });

  const fallbackRes = await fetch("/api/library", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: params.file.name,
      type: fileType,
      mimeType,
      size: params.file.size,
      dataUrl,
      source: params.source || "user_upload",
      chatTitle: params.chatTitle || "Library",
    }),
  });
  if (!fallbackRes.ok) {
    throw new Error(`Library upload failed (HTTP ${fallbackRes.status})`);
  }
  return (await fallbackRes.json()) as UploadLibraryResult;
}
