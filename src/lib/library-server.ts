import fs from "node:fs";
import path from "node:path";
import firebaseConfig from "../../firebase-applet-config.json";
import { listLibraryFilesOnDisk } from "./flow-terminal";
import { encodeFields, fromFirestoreValue, isFirebaseJwt, type AuthedUser } from "./memory-server";
import { getWritableDataDir } from "./server-data-dir";
import { guessMimeTypeFromName } from "./mime-utils";
import {
  decodeBase64DataUrlToBytes,
  extractDocumentTextFromBytes,
  isRichDocumentExtension,
  looksCorruptedBinaryString,
} from "./word-parser";

export type ServerLibraryItem = {
  id: string;
  name: string;
  type: "image" | "doc" | "artifact";
  mimeType: string;
  content?: string;
  dataUrl?: string;
  size?: number;
  source: "flow" | "user_upload" | "generated" | "artifact" | "library";
  chatTitle?: string;
  updatedAt?: string;
};

const PROJECT_ID =
  (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || (firebaseConfig as any).projectId || "").trim();
const DATABASE_ID =
  (process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID || (firebaseConfig as any).firestoreDatabaseId || "(default)").trim() || "(default)";
const FIRESTORE_DOCUMENTS_PATH = `projects/${PROJECT_ID}/databases/${encodeURIComponent(DATABASE_ID)}/documents`;
const FIRESTORE_REST_BASE = `https://firestore.googleapis.com/v1/${FIRESTORE_DOCUMENTS_PATH}`;
const LOCAL_LIB_FILE = path.join(getWritableDataDir(), "local-library.json");

function decodeDocFields(docObj: { name?: string; fields?: Record<string, any>; updateTime?: string }): Record<string, any> {
  const out: Record<string, any> = {
    _id: String(docObj.name || "").split("/").pop() || "",
    _updateTime: docObj.updateTime || "",
  };
  for (const [k, fv] of Object.entries(docObj.fields || {})) {
    out[k] = fromFirestoreValue(fv);
  }
  return out;
}

async function runFirestoreQuery(token: string, collectionId: string, fieldPath: string, uid: string): Promise<Record<string, any>[]> {
  if (!isFirebaseJwt(token)) return [];
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}:runQuery`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath },
              op: "EQUAL",
              value: { stringValue: uid },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ document?: { name?: string; fields?: Record<string, any>; updateTime?: string } }>;
    if (!Array.isArray(rows)) return [];
    return rows.filter((r) => Boolean(r.document?.name)).map((r) => decodeDocFields(r.document!));
  } catch {
    return [];
  }
}

type LocalLibStore = Record<string, ServerLibraryItem[]>;

function readLocalLibStore(): LocalLibStore {
  try {
    if (!fs.existsSync(LOCAL_LIB_FILE)) return {};
    const raw = fs.readFileSync(LOCAL_LIB_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as LocalLibStore) : {};
  } catch {
    return {};
  }
}

function writeLocalLibStore(store: LocalLibStore): void {
  try {
    const dir = path.dirname(LOCAL_LIB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(LOCAL_LIB_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to persist local library cache:", err);
  }
}

export function listLocalLibraryItems(userId: string): ServerLibraryItem[] {
  const store = readLocalLibStore();
  return Array.isArray(store[userId]) ? [...store[userId]] : [];
}

export function upsertLocalLibraryItem(userId: string, item: Omit<ServerLibraryItem, "id"> & { id?: string }): ServerLibraryItem {
  const store = readLocalLibStore();
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  const now = new Date().toISOString();
  const id = item.id || `lib_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nextItem: ServerLibraryItem = {
    id,
    name: item.name.slice(0, 260),
    type: item.type || "doc",
    mimeType: item.mimeType || "text/plain",
    ...(item.content !== undefined ? { content: item.content } : {}),
    ...(item.dataUrl !== undefined ? { dataUrl: item.dataUrl } : {}),
    ...(item.size !== undefined ? { size: item.size } : {}),
    source: item.source || "library",
    chatTitle: item.chatTitle || "Library",
    updatedAt: item.updatedAt || now,
  };
  const filtered = list.filter((x) => x.id !== id && x.name.toLowerCase() !== nextItem.name.toLowerCase());
  store[userId] = [nextItem, ...filtered].slice(0, 200);
  writeLocalLibStore(store);
  invalidateServerLibraryCache(userId);
  return nextItem;
}

export function deleteLocalLibraryItem(userId: string, idOrName: string): boolean {
  const store = readLocalLibStore();
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  const next = list.filter((x) => x.id !== idOrName && x.name !== idOrName);
  if (next.length === list.length) return false;
  store[userId] = next;
  writeLocalLibStore(store);
  invalidateServerLibraryCache(userId);
  return true;
}

export async function upsertCloudLibraryItemServer(
  authed: AuthedUser,
  item: ServerLibraryItem,
): Promise<boolean> {
  if (!authed.isJwt || !authed.token) return false;
  const docId = item.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128) || `lib_${Date.now()}`;
  const now = item.updatedAt || new Date().toISOString();
  const rawContent = item.content !== undefined ? item.content : item.dataUrl || "";
  const safeContent = rawContent.length > 840_000 ? rawContent.slice(0, 840_000) : rawContent;
  const payload = {
    userId: authed.id,
    user_id: authed.id,
    name: item.name.slice(0, 260),
    type: (item.type === "doc" ? "document" : item.type || "document").slice(0, 50),
    content: safeContent,
    projectId: null,
    taskTitle: (item.chatTitle || "Library").slice(0, 200),
    source: "flow",
    createdAt: now,
    updatedAt: now,
  };
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}/library_files/${encodeURIComponent(docId)}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${authed.token}`,
      },
      body: JSON.stringify({ fields: encodeFields(payload) }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      invalidateServerLibraryCache(authed.id);
      return true;
    }
  } catch {
  }
  return false;
}

export async function deleteCloudLibraryItemServer(
  authed: AuthedUser,
  id: string,
): Promise<boolean> {
  if (!authed.isJwt || !authed.token || !id) return false;
  const docId = id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  try {
    const res = await fetch(`${FIRESTORE_REST_BASE}/library_files/${encodeURIComponent(docId)}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${authed.token}`,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok || res.status === 404) {
      invalidateServerLibraryCache(authed.id);
      return true;
    }
  } catch {
  }
  return false;
}

const guessMimeFromName = guessMimeTypeFromName;

function normalizeMatchText(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim();
}

export function extractLibraryText(item: ServerLibraryItem): string {
  if (
    typeof item.content === "string" &&
    item.content.length > 0 &&
    !item.content.startsWith("data:") &&
    !looksCorruptedBinaryString(item.content)
  ) {
    return item.content;
  }
  const rawUrl = item.dataUrl?.startsWith("data:")
    ? item.dataUrl
    : typeof item.content === "string" && item.content.startsWith("data:")
      ? item.content
      : "";
  if (rawUrl) {
    const commaIdx = rawUrl.indexOf(",");
    if (commaIdx !== -1) {
      const meta = rawUrl.slice(5, commaIdx).toLowerCase();
      const body = rawUrl.slice(commaIdx + 1);
      const mime = meta.split(";")[0] || item.mimeType || "";
      const isTextLike =
        !isRichDocumentExtension(item.name) &&
        !item.name.toLowerCase().endsWith(".pdf") &&
        (mime.startsWith("text/") ||
          mime.includes("json") ||
          mime.includes("xml") ||
          mime.includes("javascript") ||
          mime.includes("csv") ||
          /\.(txt|md|json|csv|tsv|js|ts|tsx|jsx|py|d|di|c|h|cpp|rs|go|java|html|css|xml|yaml|yml|log|sql|sh|env)$/i.test(item.name));
      if (isTextLike) {
        try {
          const decoded = meta.includes(";base64")
            ? Buffer.from(body, "base64").toString("utf-8")
            : decodeURIComponent(body);
          return looksCorruptedBinaryString(decoded) ? "" : decoded;
        } catch {
          return "";
        }
      }
    }
  }
  return "";
}

export async function extractLibraryTextAsync(item: ServerLibraryItem): Promise<string> {
  const syncText = extractLibraryText(item);
  if (syncText) return syncText;

  const rawUrl = item.dataUrl?.startsWith("data:")
    ? item.dataUrl
    : typeof item.content === "string" && item.content.startsWith("data:")
      ? item.content
      : "";
  if (rawUrl && isRichDocumentExtension(item.name)) {
    const decoded = decodeBase64DataUrlToBytes(rawUrl);
    if (decoded) {
      try {
        const extracted = await extractDocumentTextFromBytes(
          decoded.bytes,
          item.name,
          decoded.mime || item.mimeType,
        );
        if (extracted && !looksCorruptedBinaryString(extracted)) {
          return extracted;
        }
      } catch {
      }
    }
  }
  return "";
}

export function libraryItemToBase64DataUrl(item: ServerLibraryItem): string | undefined {
  if (item.dataUrl && item.dataUrl.startsWith("data:")) {
    const commaIdx = item.dataUrl.indexOf(",");
    if (commaIdx !== -1) {
      const meta = item.dataUrl.slice(5, commaIdx);
      const body = item.dataUrl.slice(commaIdx + 1);
      if (meta.includes(";base64")) {
        return item.dataUrl;
      }
      try {
        const decoded = decodeURIComponent(body);
        const mime = meta.split(";")[0] || item.mimeType || guessMimeFromName(item.name);
        return `data:${mime};base64,${Buffer.from(decoded, "utf-8").toString("base64")}`;
      } catch {
        return item.dataUrl;
      }
    }
  }
  if (typeof item.content === "string" && item.content.length > 0) {
    const mime = item.mimeType || guessMimeFromName(item.name, "text/plain");
    return `data:${mime};base64,${Buffer.from(item.content, "utf-8").toString("base64")}`;
  }
  return undefined;
}

const cloudLibraryCache = new Map<string, { items: ServerLibraryItem[]; expiresAt: number }>();
const CLOUD_LIBRARY_CACHE_TTL_MS = 12_000;

export function invalidateServerLibraryCache(userId?: string): void {
  if (!userId) {
    cloudLibraryCache.clear();
    return;
  }
  cloudLibraryCache.delete(`${userId}:fast`);
  cloudLibraryCache.delete(`${userId}:full`);
}

export async function listAllLibraryFilesServer(
  authed: AuthedUser | null,
  clientItems: Array<{
    id?: string;
    name: string;
    type?: string;
    mimeType?: string;
    content?: string;
    dataUrl?: string;
    source?: string;
    chatTitle?: string;
    updatedAt?: string;
  }> = [],
  opts?: { includeChatMediaScan?: boolean; bypassCache?: boolean },
): Promise<ServerLibraryItem[]> {
  const includeChatMediaScan = opts?.includeChatMediaScan ?? true;
  const byKey = new Map<string, ServerLibraryItem>();

  const pushItem = (raw: ServerLibraryItem) => {
    const key = `${normalizeMatchText(raw.name)}::${raw.source}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, raw);
      return;
    }
    const existingScore = (existing.content ? 2 : 0) + (existing.dataUrl ? 2 : 0);
    const nextScore = (raw.content ? 2 : 0) + (raw.dataUrl ? 2 : 0);
    if (nextScore >= existingScore) {
      byKey.set(key, {
        ...existing,
        ...raw,
        content: raw.content ?? existing.content,
        dataUrl: raw.dataUrl ?? existing.dataUrl,
      });
    }
  };

  for (const ci of clientItems) {
    if (!ci?.name) continue;
    const typeNorm: "image" | "doc" | "artifact" =
      ci.type === "image" ? "image" : ci.type === "artifact" ? "artifact" : "doc";
    const srcNorm =
      ci.source === "flow" || ci.source === "user_upload" || ci.source === "generated" || ci.source === "artifact"
        ? ci.source
        : "library";
    const cleanClientContent =
      typeof ci.content === "string" &&
      !ci.content.startsWith("data:") &&
      !looksCorruptedBinaryString(ci.content)
        ? ci.content
        : undefined;
    const cleanClientDataUrl =
      ci.dataUrl || (typeof ci.content === "string" && ci.content.startsWith("data:") ? ci.content : undefined);
    pushItem({
      id: ci.id || `cli_${ci.name}`,
      name: ci.name,
      type: typeNorm,
      mimeType: ci.mimeType || guessMimeFromName(ci.name, typeNorm === "image" ? "image/png" : "text/plain"),
      ...(cleanClientContent !== undefined ? { content: cleanClientContent } : {}),
      ...(cleanClientDataUrl !== undefined ? { dataUrl: cleanClientDataUrl } : {}),
      source: srcNorm,
      chatTitle: ci.chatTitle || "Library",
      updatedAt: ci.updatedAt,
    });
  }

  if (authed?.id) {
    for (const loc of listLocalLibraryItems(authed.id)) {
      pushItem(loc);
    }
  }

  if (authed?.id) {
    try {
      const diskFiles = await listLibraryFilesOnDisk(null, true, `uid_${authed.id}`);
      for (const df of diskFiles) {
        const cleanDiskContent =
          typeof df.content === "string" && !looksCorruptedBinaryString(df.content)
            ? df.content
            : undefined;
        pushItem({
          id: `disk_${df.name}`,
          name: df.name,
          type: df.type === "code" || df.type === "data" ? "artifact" : "doc",
          mimeType: guessMimeFromName(df.name),
          ...(cleanDiskContent !== undefined ? { content: cleanDiskContent } : {}),
          size: df.sizeBytes,
          source: "flow",
          chatTitle: "Flow Library",
          updatedAt: df.updatedAt,
        });
      }
    } catch {
    }
  }

  if (authed?.isJwt && authed.token) {
    const cacheKey = `${authed.id}:${includeChatMediaScan ? "full" : "fast"}`;
    const cached = !opts?.bypassCache ? cloudLibraryCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      for (const item of cached.items) {
        pushItem(item);
      }
    } else {
      const cloudItems: ServerLibraryItem[] = [];
      const [libByCamel, libBySnake, chatMsgs] = await Promise.all([
        runFirestoreQuery(authed.token, "library_files", "userId", authed.id),
        runFirestoreQuery(authed.token, "library_files", "user_id", authed.id),
        includeChatMediaScan
          ? runFirestoreQuery(authed.token, "chat_messages", "user_id", authed.id)
          : Promise.resolve([] as Record<string, any>[]),
      ]);

      const seenDocIds = new Set<string>();
      for (const doc of [...libByCamel, ...libBySnake]) {
        if (!doc._id || seenDocIds.has(doc._id)) continue;
        seenDocIds.add(doc._id);
        const name = String(doc.name || "file.txt");
        const rawContent = typeof doc.content === "string" ? doc.content : "";
        const isDataUrl = rawContent.startsWith("data:");
        const isCorrupted = !isDataUrl && looksCorruptedBinaryString(rawContent);
        const typeNorm: "image" | "doc" | "artifact" =
          doc.type === "image" || (isDataUrl && rawContent.startsWith("data:image/"))
            ? "image"
            : doc.type === "code" || doc.type === "data" || doc.type === "artifact"
              ? "artifact"
              : "doc";
        const item: ServerLibraryItem = {
          id: doc._id,
          name,
          type: typeNorm,
          mimeType: guessMimeFromName(name, typeNorm === "image" ? "image/png" : "text/plain"),
          ...(isDataUrl ? { dataUrl: rawContent } : isCorrupted ? {} : { content: rawContent }),
          source: doc.source === "flow" ? "flow" : "library",
          chatTitle: doc.taskTitle ? `Flow: ${doc.taskTitle}` : "Library",
          updatedAt: String(doc.updatedAt || doc.createdAt || doc._updateTime || ""),
        };
        cloudItems.push(item);
        pushItem(item);
      }

      for (const msg of chatMsgs) {
        const msgContent = String(msg.content || "");
        const matches = [...msgContent.matchAll(/!\[([^\]]*)\]\((data:[^)]+)\)/g)];
        for (const match of matches) {
          const name = match[1] || "attachment";
          const dataUrl = match[2];
          const isImg = dataUrl.startsWith("data:image/");
          const mimeMatch = dataUrl.match(/^data:([^;]+);/);
          const item: ServerLibraryItem = {
            id: `${msg._id}_${name}`,
            name,
            type: isImg ? "image" : "doc",
            mimeType: mimeMatch?.[1] || guessMimeFromName(name),
            dataUrl,
            source: "user_upload",
            chatTitle: "Chat upload",
            updatedAt: String(msg.created_at || msg._updateTime || ""),
          };
          cloudItems.push(item);
          pushItem(item);
        }
        if (Array.isArray(msg.images)) {
          for (const img of msg.images) {
            if (!img?.dataUrl) continue;
            const name = String(img.title || "generated_image.png");
            const item: ServerLibraryItem = {
              id: String(img.id || `${msg._id}_img`),
              name,
              type: "image",
              mimeType: "image/png",
              dataUrl: img.dataUrl,
              source: "generated",
              chatTitle: "AI Art",
              updatedAt: String(msg.created_at || msg._updateTime || ""),
            };
            cloudItems.push(item);
            pushItem(item);
          }
        }
        if (Array.isArray(msg.artifacts)) {
          for (const art of msg.artifacts) {
            if (art?.content === undefined) continue;
            const name = art.title
              ? art.title.includes(".")
                ? art.title
                : `${art.title}.${art.language || "txt"}`
              : "artifact.txt";
            const item: ServerLibraryItem = {
              id: String(art.id || `${msg._id}_art`),
              name,
              type: "artifact",
              mimeType: guessMimeFromName(name, "text/plain"),
              content: String(art.content || ""),
              source: "artifact",
              chatTitle: "Artifact",
              updatedAt: String(msg.created_at || msg._updateTime || ""),
            };
            cloudItems.push(item);
            pushItem(item);
          }
        }
      }

      cloudLibraryCache.set(cacheKey, { items: cloudItems, expiresAt: Date.now() + CLOUD_LIBRARY_CACHE_TTL_MS });
    }
  }

  const result = Array.from(byKey.values());
  result.sort((a, b) => (Date.parse(b.updatedAt || "") || 0) - (Date.parse(a.updatedAt || "") || 0));
  return result;
}

export function findLibraryFiles(
  items: ServerLibraryItem[],
  opts: { id?: string; filename?: string; query?: string },
): ServerLibraryItem[] {
  if (opts.id) {
    const exactId = items.filter((i) => i.id === opts.id);
    if (exactId.length > 0) return exactId;
  }
  if (opts.filename) {
    const fn = normalizeMatchText(opts.filename);
    const exactName = items.filter((i) => normalizeMatchText(i.name) === fn);
    if (exactName.length > 0) return exactName;
    const partialName = items.filter((i) => normalizeMatchText(i.name).includes(fn) || fn.includes(normalizeMatchText(i.name)));
    if (partialName.length > 0) return partialName;
  }
  const q = normalizeMatchText(opts.query || "");
  if (!q) return items.slice(0, 20);

  const words = q
    .split(/[\s,.;:!?()"'«»]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);

  const scored = items
    .map((item) => {
      let score = 0;
      const nameNorm = normalizeMatchText(item.name);
      const text = normalizeMatchText(extractLibraryText(item).slice(0, 4000));
      const meta = normalizeMatchText(`${item.chatTitle || ""} ${item.source} ${item.type}`);
      if (nameNorm === q) score += 10;
      if (nameNorm.includes(q)) score += 6;
      for (const w of words) {
        const stem = w.length >= 5 ? w.slice(0, w.length - 1) : w;
        if (nameNorm.includes(w)) score += 4;
        else if (stem.length >= 3 && nameNorm.includes(stem)) score += 2.5;
        if (text.includes(w)) score += 1.5;
        else if (stem.length >= 3 && text.includes(stem)) score += 0.8;
        if (meta.includes(w)) score += 1;
      }
      return { item, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);

  return scored.length > 0 ? scored.slice(0, 15) : items.slice(0, 10);
}
