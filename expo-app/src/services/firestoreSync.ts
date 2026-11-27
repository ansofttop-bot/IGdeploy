import { IGSEEK_CONFIG } from "../config";
import {
  AuthSession,
  ChatMessageItem,
  ChatThread,
  EngineFileItem,
  EngineProjectItem,
  GeneratedImageItem,
  LibraryFileItem,
  MemoryEntryItem,
  ProjectFolder,
  SubscriptionInfo,
} from "../types/models";

const PROJECT_ID = IGSEEK_CONFIG.firebase.projectId;
const DATABASE_ID = IGSEEK_CONFIG.firebase.firestoreDatabaseId || "(default)";
const DOCS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

export interface RemoteProfileData {
  displayName?: string;
  theme?: "dark" | "light";
  accent?: string;
  lang?: "ru" | "en";
  subscription: SubscriptionInfo;
}

function canSync(session: AuthSession | null): session is AuthSession {
  return Boolean(session && !session.isGuest && session.uid && session.idToken);
}

function sanitizeDocId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  return cleaned || `doc_${Date.now()}`;
}

function msToIso(ms: number): string {
  try {
    return new Date(ms || Date.now()).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function isoToMs(iso?: string | null, fallback = Date.now()): number {
  if (!iso) return fallback;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const strVal = (v: string) => ({ stringValue: v });
const boolVal = (v: boolean) => ({ booleanValue: v });
const intVal = (v: number) => ({ integerValue: String(Math.trunc(v)) });
const nullVal = () => ({ nullValue: null });

function optStr(fields: Record<string, any> | undefined, key: string): string | undefined {
  const f = fields?.[key];
  return typeof f?.stringValue === "string" ? f.stringValue : undefined;
}

function optBool(fields: Record<string, any> | undefined, key: string, fallback = false): boolean {
  const f = fields?.[key];
  return typeof f?.booleanValue === "boolean" ? f.booleanValue : fallback;
}

function optNum(fields: Record<string, any> | undefined, key: string, fallback = 0): number {
  const f = fields?.[key];
  if (f?.integerValue !== undefined) {
    const n = Number(f.integerValue);
    return Number.isFinite(n) ? n : fallback;
  }
  if (f?.doubleValue !== undefined) {
    const n = Number(f.doubleValue);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function extractDocId(name: string): string {
  const idx = name.lastIndexOf("/");
  return idx >= 0 ? name.slice(idx + 1) : name;
}

async function runUserCollectionQuery(
  session: AuthSession,
  collectionId: string,
  limit = 100
): Promise<Array<{ id: string; fields: Record<string, any> }>> {
  const map = new Map<string, Record<string, any>>();
  for (const ownerField of ["user_id", "userId"]) {
    try {
      const res = await fetch(`${DOCS_BASE}:runQuery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.idToken}`,
        },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId }],
            where: {
              fieldFilter: {
                field: { fieldPath: ownerField },
                op: "EQUAL",
                value: strVal(session.uid),
              },
            },
            limit,
          },
        }),
      });
      if (!res.ok) continue;
      const rows = await res.json();
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const doc = row?.document;
        if (doc?.name && doc?.fields) {
          map.set(extractDocId(doc.name), doc.fields);
        }
      }
    } catch {
      // Ignore single field fallback error
    }
  }
  return Array.from(map.entries()).map(([id, fields]) => ({ id, fields }));
}

async function patchDocument(
  session: AuthSession,
  collectionId: string,
  docId: string,
  fields: Record<string, any>
): Promise<boolean> {
  try {
    const safeId = sanitizeDocId(docId);
    const res = await fetch(`${DOCS_BASE}/${collectionId}/${safeId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.idToken}`,
      },
      body: JSON.stringify({ fields }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteDocument(
  session: AuthSession,
  collectionId: string,
  docId: string
): Promise<boolean> {
  try {
    const safeId = sanitizeDocId(docId);
    const res = await fetch(`${DOCS_BASE}/${collectionId}/${safeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.idToken}` },
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export async function fetchProfile(session: AuthSession | null): Promise<RemoteProfileData | null> {
  if (!canSync(session)) return null;
  try {
    const safeUid = sanitizeDocId(session.uid);
    const res = await fetch(`${DOCS_BASE}/profiles/${safeUid}`, {
      headers: { Authorization: `Bearer ${session.idToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const f = data?.fields;
    if (!f) return null;

    const plan = optStr(f, "plan") || "free";
    const status = optStr(f, "subscription_status") || optStr(f, "subscriptionStatus") || plan;
    const expiresAt = optStr(f, "subscription_expires_at") || optStr(f, "subscriptionExpiresAt") || null;
    const lifetime = optBool(f, "pro_lifetime") || optBool(f, "proLifetime");
    const expiresMs = expiresAt ? isoToMs(expiresAt, 0) : 0;
    const daysLeft =
      expiresMs > Date.now()
        ? Math.max(1, Math.ceil((expiresMs - Date.now()) / 86_400_000))
        : 0;
    const isPro =
      lifetime ||
      plan.toLowerCase() === "pro" ||
      (status.toLowerCase() === "active" && (expiresMs === 0 || expiresMs > Date.now()));

    const rawTheme = optStr(f, "theme");
    const rawLang = optStr(f, "lang");

    return {
      displayName: optStr(f, "display_name") || optStr(f, "displayName"),
      theme: rawTheme === "light" || rawTheme === "dark" ? rawTheme : undefined,
      accent: optStr(f, "accent"),
      lang: rawLang === "ru" || rawLang === "en" ? rawLang : undefined,
      subscription: {
        plan: isPro ? "pro" : "free",
        isPro,
        status: isPro ? "active" : status,
        daysLeft: lifetime ? 9999 : daysLeft,
        expiresAt,
        lastKeyId: optStr(f, "subscription_txn_id") || optStr(f, "subscriptionTxnId") || null,
        durationDays: 30,
      },
    };
  } catch {
    return null;
  }
}

export async function saveProfilePrefs(
  session: AuthSession | null,
  theme: "dark" | "light",
  accent: string,
  lang: "ru" | "en"
): Promise<void> {
  if (!canSync(session)) return;
  try {
    const safeUid = sanitizeDocId(session.uid);
    const fields = {
      id: strVal(session.uid),
      email: strVal(session.email || ""),
      display_name: strVal((session.displayName || "").slice(0, 120)),
      theme: strVal(theme),
      accent: strVal(accent),
      lang: strVal(lang),
      updated_at: strVal(new Date().toISOString()),
    };
    const mask = Object.keys(fields)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join("&");
    await fetch(`${DOCS_BASE}/profiles/${safeUid}?${mask}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.idToken}`,
      },
      body: JSON.stringify({ fields }),
    });
  } catch {
    // Non-fatal
  }
}

export async function fetchProjects(session: AuthSession | null): Promise<ProjectFolder[]> {
  if (!canSync(session)) return [];
  const rows = await runUserCollectionQuery(session, "projects", 80);
  return rows
    .map(({ id, fields }) => {
      const name = optStr(fields, "name");
      if (!name) return null;
      return {
        id,
        name,
        updatedAtMs: isoToMs(optStr(fields, "updated_at") || optStr(fields, "updatedAt")),
      };
    })
    .filter((x): x is ProjectFolder => Boolean(x))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export async function syncProject(session: AuthSession | null, project: ProjectFolder): Promise<void> {
  if (!canSync(session)) return;
  const iso = msToIso(project.updatedAtMs);
  await patchDocument(session, "projects", project.id, {
    user_id: strVal(session.uid),
    name: strVal(project.name.slice(0, 100)),
    created_at: strVal(iso),
    updated_at: strVal(iso),
  });
}

export async function deleteProject(session: AuthSession | null, projectId: string): Promise<void> {
  if (!canSync(session)) return;
  await deleteDocument(session, "projects", projectId);
}

export async function fetchChats(session: AuthSession | null): Promise<ChatThread[]> {
  if (!canSync(session)) return [];
  const rows = await runUserCollectionQuery(session, "chats", 120);
  return rows
    .map(({ id, fields }) => ({
      id,
      title: optStr(fields, "title") || "Новый чат",
      updatedAtMs: isoToMs(
        optStr(fields, "updated_at") || optStr(fields, "updatedAt") || optStr(fields, "created_at")
      ),
      isSaved: optBool(fields, "is_saved") || optBool(fields, "isSaved"),
      projectId: optStr(fields, "project_id") || optStr(fields, "projectId") || null,
    }))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export async function syncChat(session: AuthSession | null, chat: ChatThread): Promise<void> {
  if (!canSync(session)) return;
  const iso = msToIso(chat.updatedAtMs);
  await patchDocument(session, "chats", chat.id, {
    user_id: strVal(session.uid),
    title: strVal(chat.title.slice(0, 200)),
    chat_type: strVal("chat"),
    is_saved: boolVal(chat.isSaved),
    project_id: chat.projectId ? strVal(chat.projectId) : nullVal(),
    updated_at: strVal(iso),
    created_at: strVal(iso),
  });
}

export async function deleteChat(session: AuthSession | null, chatId: string): Promise<void> {
  if (!canSync(session)) return;
  await deleteDocument(session, "chats", chatId);
}

function parseFirestoreImages(field: any): GeneratedImageItem[] {
  const values = field?.arrayValue?.values;
  if (!Array.isArray(values)) return [];
  const out: GeneratedImageItem[] = [];
  for (let i = 0; i < values.length; i++) {
    const mf = values[i]?.mapValue?.fields;
    const dataUrl = optStr(mf, "dataUrl");
    if (!dataUrl) continue;
    out.push({
      id: optStr(mf, "id") || `img_${i}`,
      title: optStr(mf, "title") || "IGseek Image",
      dataUrl,
    });
  }
  return out;
}

export async function fetchAllMessages(session: AuthSession | null): Promise<Record<string, ChatMessageItem[]>> {
  if (!canSync(session)) return {};
  const rows = await runUserCollectionQuery(session, "chat_messages", 400);
  const grouped: Record<string, ChatMessageItem[]> = {};
  for (const { id, fields } of rows) {
    const chatId = optStr(fields, "chat_id") || optStr(fields, "chatId");
    if (!chatId) continue;
    const msg: ChatMessageItem = {
      id,
      chatId,
      role: optStr(fields, "role") === "user" ? "user" : "assistant",
      content: optStr(fields, "content") || "",
      reasoning: optStr(fields, "reasoning") || "",
      images: parseFirestoreImages(fields.images),
      createdAtMs: isoToMs(
        optStr(fields, "created_at") || optStr(fields, "createdAt"),
        optNum(fields, "position", 0)
      ),
    };
    if (!grouped[chatId]) grouped[chatId] = [];
    grouped[chatId].push(msg);
  }
  for (const cid of Object.keys(grouped)) {
    grouped[cid].sort((a, b) => a.createdAtMs - b.createdAtMs);
  }
  return grouped;
}

export async function syncMessage(
  session: AuthSession | null,
  msg: ChatMessageItem,
  position: number
): Promise<void> {
  if (!canSync(session)) return;
  const iso = msToIso(msg.createdAtMs);
  const fields: Record<string, any> = {
    user_id: strVal(session.uid),
    chat_id: strVal(msg.chatId),
    role: strVal(msg.role === "user" ? "user" : "assistant"),
    content: strVal((msg.content || "").slice(0, 900_000)),
    position: intVal(position),
    created_at: strVal(iso),
    updated_at: strVal(iso),
  };
  if (msg.reasoning) {
    fields.reasoning = strVal(msg.reasoning.slice(0, 400_000));
  }
  if (msg.images && msg.images.length > 0) {
    const values: any[] = [];
    let totalChars = 0;
    for (const img of msg.images.slice(0, 6)) {
      if (img.dataUrl.length > 220_000 || totalChars + img.dataUrl.length > 550_000) continue;
      totalChars += img.dataUrl.length;
      values.push({
        mapValue: {
          fields: {
            id: strVal(img.id.slice(0, 120)),
            title: strVal(img.title.slice(0, 200)),
            dataUrl: strVal(img.dataUrl),
          },
        },
      });
    }
    if (values.length > 0) {
      fields.images = { arrayValue: { values } };
    }
  }
  await patchDocument(session, "chat_messages", msg.id, fields);
}

export async function fetchMemories(session: AuthSession | null): Promise<MemoryEntryItem[]> {
  if (!canSync(session)) return [];
  const rows = await runUserCollectionQuery(session, "memories", 150);
  return rows
    .map(({ id, fields }) => {
      const content = optStr(fields, "content");
      if (!content) return null;
      const rawKind = optStr(fields, "kind") || "other";
      const validKinds = ["preference", "fact", "goal", "work", "other"];
      const kind = (validKinds.includes(rawKind) ? rawKind : "other") as MemoryEntryItem["kind"];
      return {
        id,
        content,
        kind,
        createdAt: optStr(fields, "created_at") || optStr(fields, "createdAt") || "",
      };
    })
    .filter((x): x is MemoryEntryItem => Boolean(x))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function syncMemory(session: AuthSession | null, entry: MemoryEntryItem): Promise<void> {
  if (!canSync(session)) return;
  const iso = entry.createdAt || new Date().toISOString();
  await patchDocument(session, "memories", entry.id, {
    user_id: strVal(session.uid),
    content: strVal(entry.content.slice(0, 4000)),
    kind: strVal(entry.kind || "other"),
    createdAt: strVal(iso),
    updatedAt: strVal(new Date().toISOString()),
  });
}

export async function deleteMemory(session: AuthSession | null, id: string): Promise<void> {
  if (!canSync(session)) return;
  await deleteDocument(session, "memories", id);
}

export async function fetchLibraryFiles(session: AuthSession | null): Promise<LibraryFileItem[]> {
  if (!canSync(session)) return [];
  const rows = await runUserCollectionQuery(session, "library_files", 120);
  const items: LibraryFileItem[] = [];
  for (const { id, fields } of rows) {
    const name = optStr(fields, "name");
    if (!name) continue;
    const content = optStr(fields, "content") || "";
    const isImg =
      content.startsWith("data:image/") ||
      content.startsWith("https://image.pollinations.ai/");
    const rawType = optStr(fields, "type") || "doc";
    const type: LibraryFileItem["type"] = isImg
      ? "image"
      : rawType === "code" || rawType === "data" || rawType === "image"
      ? rawType
      : "doc";
    items.push({
      id,
      name,
      type,
      mimeType: isImg ? "image/jpeg" : "text/plain",
      sizeBytes: content.length,
      source: optStr(fields, "source") || "library",
      chatTitle: optStr(fields, "taskTitle") || "Library",
      updatedAt: optStr(fields, "updatedAt") || optStr(fields, "updated_at") || "",
      content: isImg ? null : content,
      dataUrl: isImg ? content : null,
    });
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function syncLibraryFile(session: AuthSession | null, item: LibraryFileItem): Promise<void> {
  if (!canSync(session)) return;
  const body = (item.dataUrl || item.content || "").slice(0, 850_000);
  const iso = item.updatedAt || new Date().toISOString();
  await patchDocument(session, "library_files", item.id, {
    user_id: strVal(session.uid),
    name: strVal(item.name.slice(0, 260)),
    type: strVal(item.type || "doc"),
    content: strVal(body),
    source: strVal(item.source || "library"),
    taskTitle: strVal((item.chatTitle || "Library").slice(0, 200)),
    createdAt: strVal(iso),
    updatedAt: strVal(iso),
  });
}

export async function deleteLibraryFile(session: AuthSession | null, id: string): Promise<void> {
  if (!canSync(session)) return;
  await deleteDocument(session, "library_files", id);
}

export async function fetchEngineProjects(session: AuthSession | null): Promise<EngineProjectItem[]> {
  if (!canSync(session)) return [];
  const rows = await runUserCollectionQuery(session, "engine_projects", 50);
  return rows
    .map(({ id, fields }) => {
      const title = optStr(fields, "title");
      if (!title) return null;
      const filesMap = fields.files?.mapValue?.fields || {};
      const files: EngineFileItem[] = Object.keys(filesMap)
        .sort()
        .map((path) => ({
          path,
          content: optStr(filesMap, path) || "",
        }));
      return {
        id,
        title,
        activeFile: optStr(fields, "activeFile") || files[0]?.path || "",
        files,
        updatedAtMs: isoToMs(optStr(fields, "updatedAt") || optStr(fields, "updated_at")),
      };
    })
    .filter((x): x is EngineProjectItem => Boolean(x))
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export async function syncEngineProject(
  session: AuthSession | null,
  project: EngineProjectItem
): Promise<void> {
  if (!canSync(session)) return;
  const iso = msToIso(project.updatedAtMs);
  const fileFields: Record<string, any> = {};
  for (const f of project.files) {
    fileFields[f.path] = strVal(f.content.slice(0, 200_000));
  }
  await patchDocument(session, "engine_projects", project.id, {
    user_id: strVal(session.uid),
    title: strVal(project.title.slice(0, 200)),
    activeFile: strVal(project.activeFile.slice(0, 260)),
    files: { mapValue: { fields: fileFields } },
    createdAt: strVal(iso),
    updatedAt: strVal(iso),
  });
}

export async function deleteEngineProject(session: AuthSession | null, id: string): Promise<void> {
  if (!canSync(session)) return;
  await deleteDocument(session, "engine_projects", id);
}
