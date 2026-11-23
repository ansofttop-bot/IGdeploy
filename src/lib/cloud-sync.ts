import {
  auth,
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  OperationType,
  handleFirestoreError,
  type Unsubscribe,
} from "./firebase";

export const CLOUD_UID_KEY = "igseek:cloud_uid";
export const ENGINE_PROJ_PREFIX = "igseek:engine_proj_";
export const ENGINE_CHAT_IDS_KEY = "igseek:engine_chat_ids";
export const FLOW_TASKS_KEY = "igseek:flow_tasks";
export const FLOW_LIBRARY_KEY = "igseek:flow_library_files";

export interface SyncedLibraryFile {
  id: string;
  name: string;
  type: string;
  content: string;
  projectId: string | null;
  taskId?: string;
  taskTitle?: string;
  source: "flow";
  createdAt: string;
  updatedAt: string;
}

export interface SyncedChatRow {
  id: string;
  title: string;
  updated_at: string;
  is_saved: boolean;
  project_id: string | null;
  chat_type?: string;
}

export interface SyncedProjectRow {
  id: string;
  name: string;
  updated_at: string;
}

export interface SyncedChatMessageRow {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string | null;
  artifacts?: any[] | null;
  images?: any[] | null;
  web_images?: any[] | null;
  calendar_events?: any[] | null;
  task_events?: any[] | null;
  gmail_events?: any[] | null;
  refusals?: any[] | null;
  tab_transitions?: any[] | null;
  memory_saved?: boolean | null;
  position: number;
  created_at: string;
}

export interface SyncedMemoryAttachment {
  name: string;
  type: string;
  size?: number;
  dataUrl?: string;
  textContent?: string;
}

export interface SyncedMemoryRow {
  id: string;
  content: string;
  kind: string;
  created_at: string;
  attachment?: SyncedMemoryAttachment;
}

export interface CloudEngineMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  filesUpdated?: string[];
  limitCooldown?: {
    scope: "engine" | "chat" | "flow" | "image";
    used?: number;
    limit?: number;
    resetAt: number;
  };
}

export interface CloudEngineProject {
  id: string;
  userId: string;
  title: string;
  projectId: string | null;
  activeFile: string;
  files: Record<string, string>;
  chatMessages: CloudEngineMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface CloudChatMessageForLibrary {
  id: string;
  chatId: string;
  content: string;
  images?: Array<{ id?: string; title?: string; prompt?: string; dataUrl: string }>;
  artifacts?: Array<{ id?: string; title?: string; language?: string; description?: string; content: string }>;
}

function cleanFirestorePayload<T>(obj: T): T {
  if (obj === undefined) return null as unknown as T;
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.filter((v) => v !== undefined).map(cleanFirestorePayload) as unknown as T;
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj as Record<string, any>)) {
    if (v !== undefined) {
      out[k] = cleanFirestorePayload(v);
    }
  }
  return out as T;
}

function sanitizeDocId(rawId: string): string {
  const safe = rawId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  return safe || `doc_${Date.now()}`;
}

export async function waitForCloudAuth(expectedUid?: string | null): Promise<string | null> {
  if (expectedUid && (expectedUid === "guest" || expectedUid.startsWith("local_"))) {
    return null;
  }
  if (auth.currentUser) {
    if (expectedUid && auth.currentUser.uid !== expectedUid) return auth.currentUser.uid;
    return auth.currentUser.uid;
  }
  try {
    if (typeof (auth as any).authStateReady === "function") {
      await Promise.race([
        (auth as any).authStateReady(),
        new Promise<void>((resolve) => setTimeout(resolve, 2500)),
      ]);
    }
  } catch {
  }
  const currentUser = (auth as { currentUser: { uid: string } | null }).currentUser;
  const uid = currentUser?.uid ?? null;
  if (!uid || uid.startsWith("local_")) return null;
  return uid;
}

function parseIsoMs(val: unknown): number {
  if (typeof val !== "string" || !val) return 0;
  const ms = Date.parse(val);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Subscribes to both `user_id == uid` and `userId == uid` queries on a collection,
 * deduplicating documents by ID so legacy and new documents both sync in real time.
 */
function subscribeDualOwnerCollection(
  collectionName: string,
  uid: string,
  onDocs: (docs: Array<{ id: string; data: Record<string, any> }>) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  if (!uid || uid === "guest" || uid.startsWith("local_")) {
    return () => {};
  }

  let disposed = false;
  let unsubSnake: Unsubscribe | null = null;
  let unsubCamel: Unsubscribe | null = null;

  const snakeMap = new Map<string, Record<string, any>>();
  const camelMap = new Map<string, Record<string, any>>();
  let snakeReady = false;
  let camelReady = false;
  let snakeFailed = false;
  let camelFailed = false;

  const emit = () => {
    if (disposed) return;
    if (!snakeReady && !snakeFailed && !camelReady && !camelFailed) return;
    const merged = new Map<string, Record<string, any>>();
    for (const [id, data] of camelMap.entries()) merged.set(id, data);
    for (const [id, data] of snakeMap.entries()) merged.set(id, data);
    const list = Array.from(merged.entries()).map(([id, data]) => ({ id, data }));
    onDocs(list);
  };

  void waitForCloudAuth(uid).then((activeUid) => {
    if (disposed || !activeUid) return;

    const qSnake = query(collection(db, collectionName), where("user_id", "==", activeUid));
    const qCamel = query(collection(db, collectionName), where("userId", "==", activeUid));

    unsubSnake = onSnapshot(
      qSnake,
      (snap) => {
        snakeMap.clear();
        for (const d of snap.docs) {
          snakeMap.set(d.id, d.data() as Record<string, any>);
        }
        snakeReady = true;
        emit();
      },
      (err) => {
        snakeFailed = true;
        if (camelFailed && onError) {
          onError(err);
        } else {
          try {
            handleFirestoreError(err, OperationType.LIST, collectionName);
          } catch {
          }
        }
      },
    );

    unsubCamel = onSnapshot(
      qCamel,
      (snap) => {
        camelMap.clear();
        for (const d of snap.docs) {
          camelMap.set(d.id, d.data() as Record<string, any>);
        }
        camelReady = true;
        emit();
      },
      (err) => {
        camelFailed = true;
        if (snakeFailed && onError) {
          onError(err);
        }
      },
    );
  });

  return () => {
    disposed = true;
    try {
      unsubSnake?.();
    } catch {}
    try {
      unsubCamel?.();
    } catch {}
  };
}

export function clearLocalUserCaches(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(FLOW_LIBRARY_KEY);
    window.localStorage.removeItem(FLOW_TASKS_KEY);
    window.localStorage.removeItem(ENGINE_CHAT_IDS_KEY);
    window.localStorage.removeItem(CLOUD_UID_KEY);
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(ENGINE_PROJ_PREFIX)) {
        toRemove.push(key);
      }
    }
    for (const k of toRemove) {
      window.localStorage.removeItem(k);
    }
    window.dispatchEvent(new CustomEvent("igseek:library-updated"));
  } catch {
  }
}

export function ensureAccountScope(uid: string): void {
  if (typeof window === "undefined" || !uid) return;
  try {
    const prevUid = window.localStorage.getItem(CLOUD_UID_KEY);
    if (prevUid && prevUid !== uid) {
      clearLocalUserCaches();
    }
    window.localStorage.setItem(CLOUD_UID_KEY, uid);
  } catch {
  }
}

export function getActiveCloudUid(): string | null {
  const uid = auth.currentUser?.uid ?? null;
  if (!uid || uid.startsWith("local_")) return null;
  return uid;
}

// ─── Real-Time Chats, Messages & Projects Sync ───────────────────────────────

export function subscribeCloudChats(
  uid: string,
  onChats: (chats: SyncedChatRow[]) => void,
): Unsubscribe {
  return subscribeDualOwnerCollection("chats", uid, (docs) => {
    const list: SyncedChatRow[] = docs
      .map(({ id, data }) => ({
        id,
        title: String(data.title || "New chat"),
        updated_at: String(data.updated_at || data.updatedAt || data.created_at || data.createdAt || new Date().toISOString()),
        is_saved: Boolean(data.is_saved ?? data.isSaved ?? false),
        project_id: (data.project_id ?? data.projectId ?? null) as string | null,
        chat_type: (data.chat_type ?? data.chatType) as string | undefined,
      }))
      .sort((a, b) => parseIsoMs(b.updated_at) - parseIsoMs(a.updated_at))
      .slice(0, 250);
    onChats(list);
  });
}

export function subscribeCloudProjects(
  uid: string,
  onProjects: (projects: SyncedProjectRow[]) => void,
): Unsubscribe {
  return subscribeDualOwnerCollection("projects", uid, (docs) => {
    const list: SyncedProjectRow[] = docs
      .map(({ id, data }) => ({
        id,
        name: String(data.name || "Untitled project"),
        updated_at: String(data.updated_at || data.updatedAt || data.created_at || data.createdAt || new Date().toISOString()),
      }))
      .sort((a, b) => parseIsoMs(b.updated_at) - parseIsoMs(a.updated_at));
    onProjects(list);
  });
}

export function subscribeCloudChatMessages(
  uid: string,
  chatId: string,
  onMessages: (messages: SyncedChatMessageRow[]) => void,
): Unsubscribe {
  if (!uid || !chatId || uid === "guest" || uid.startsWith("local_")) {
    return () => {};
  }
  return subscribeDualOwnerCollection("chat_messages", uid, (docs) => {
    const filtered: SyncedChatMessageRow[] = [];
    for (const { id, data } of docs) {
      const msgChatId = String(data.chat_id || data.chatId || "");
      if (msgChatId !== chatId) continue;
      filtered.push({
        id,
        chat_id: msgChatId,
        role: data.role === "assistant" ? "assistant" : "user",
        content: String(data.content ?? ""),
        reasoning: data.reasoning ?? null,
        artifacts: Array.isArray(data.artifacts) ? data.artifacts : null,
        images: Array.isArray(data.images) ? data.images : null,
        web_images: Array.isArray(data.web_images ?? data.webImages) ? (data.web_images ?? data.webImages) : null,
        calendar_events: Array.isArray(data.calendar_events ?? data.calendarEvents) ? (data.calendar_events ?? data.calendarEvents) : null,
        task_events: Array.isArray(data.task_events ?? data.taskEvents) ? (data.task_events ?? data.taskEvents) : null,
        gmail_events: Array.isArray(data.gmail_events ?? data.gmailEvents) ? (data.gmail_events ?? data.gmailEvents) : null,
        refusals: Array.isArray(data.refusals) ? data.refusals : null,
        tab_transitions: Array.isArray(data.tab_transitions ?? data.tabTransitions) ? (data.tab_transitions ?? data.tabTransitions) : null,
        memory_saved: Boolean(data.memory_saved ?? data.memorySaved ?? false),
        position: typeof data.position === "number" ? data.position : 0,
        created_at: String(data.created_at || data.createdAt || new Date().toISOString()),
      });
    }
    filtered.sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return parseIsoMs(a.created_at) - parseIsoMs(b.created_at);
    });
    onMessages(filtered);
  });
}

// ─── Real-Time Memories Sync (Direct Firestore Client SDK) ───────────────────

export function subscribeCloudMemories(
  uid: string,
  onMemories: (memories: SyncedMemoryRow[]) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return subscribeDualOwnerCollection(
    "memories",
    uid,
    (docs) => {
      const list: SyncedMemoryRow[] = docs
        .map(({ id, data }) => {
          const att =
            data.attachment && typeof data.attachment === "object"
              ? ({
                  name: String(data.attachment.name || "file"),
                  type: String(data.attachment.type || "application/octet-stream"),
                  ...(typeof data.attachment.size === "number" ? { size: data.attachment.size } : {}),
                  ...(typeof data.attachment.dataUrl === "string" ? { dataUrl: data.attachment.dataUrl } : {}),
                  ...(typeof data.attachment.textContent === "string" ? { textContent: data.attachment.textContent } : {}),
                } satisfies SyncedMemoryAttachment)
              : undefined;
          return {
            id,
            content: String(data.content ?? ""),
            kind: String(data.kind || "other"),
            created_at: String(data.created_at || data.createdAt || new Date().toISOString()),
            ...(att ? { attachment: att } : {}),
          };
        })
        .sort((a, b) => parseIsoMs(b.created_at) - parseIsoMs(a.created_at));
      onMemories(list);
    },
    onError,
  );
}

export async function createCloudMemory(
  uid: string,
  input: { content: string; kind?: string; attachment?: SyncedMemoryAttachment | null },
): Promise<SyncedMemoryRow | null> {
  const activeUid = await waitForCloudAuth(uid);
  if (!activeUid) return null;
  const now = new Date().toISOString();
  const payload = cleanFirestorePayload({
    user_id: activeUid,
    userId: activeUid,
    content: input.content.trim().slice(0, 4000),
    kind: (input.kind || "other").slice(0, 50),
    created_at: now,
    createdAt: now,
    updated_at: now,
    updatedAt: now,
    ...(input.attachment ? { attachment: input.attachment } : {}),
  });
  try {
    const ref = await addDoc(collection(db, "memories"), payload);
    return {
      id: ref.id,
      content: payload.content,
      kind: payload.kind,
      created_at: now,
      ...(input.attachment ? { attachment: input.attachment } : {}),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, "memories");
    return null;
  }
}

export async function updateCloudMemory(
  uid: string,
  id: string,
  input: { content: string; kind?: string; attachment?: SyncedMemoryAttachment | null },
): Promise<boolean> {
  const activeUid = await waitForCloudAuth(uid);
  if (!activeUid || !id) return false;
  const now = new Date().toISOString();
  const patch: Record<string, any> = {
    user_id: activeUid,
    userId: activeUid,
    content: input.content.trim().slice(0, 4000),
    updated_at: now,
    updatedAt: now,
  };
  if (input.kind) patch.kind = input.kind.slice(0, 50);
  if (input.attachment !== undefined) {
    patch.attachment = input.attachment;
  }
  try {
    await updateDoc(doc(db, "memories", id), cleanFirestorePayload(patch));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `memories/${id}`);
    return false;
  }
}

export async function deleteCloudMemory(id: string): Promise<boolean> {
  const activeUid = await waitForCloudAuth();
  if (!activeUid || !id) return false;
  try {
    await deleteDoc(doc(db, "memories", id));
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `memories/${id}`);
    return false;
  }
}

// ─── Engine Projects Real-Time Sync ──────────────────────────────────────────

export function subscribeCloudEngineProjectIds(
  uid: string,
  onIds: (ids: string[]) => void,
): Unsubscribe {
  return subscribeDualOwnerCollection("engine_projects", uid, (docs) => {
    onIds(docs.map((d) => d.id));
  });
}

export async function listCloudEngineProjectIds(uid: string): Promise<string[]> {
  const activeUid = await waitForCloudAuth(uid);
  if (!activeUid) return [];
  try {
    const [camelSnap, snakeSnap] = await Promise.all([
      getDocs(query(collection(db, "engine_projects"), where("userId", "==", activeUid))).catch(() => null),
      getDocs(query(collection(db, "engine_projects"), where("user_id", "==", activeUid))).catch(() => null),
    ]);
    const ids = new Set<string>();
    camelSnap?.docs.forEach((d) => ids.add(d.id));
    snakeSnap?.docs.forEach((d) => ids.add(d.id));
    return Array.from(ids);
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, "engine_projects");
    } catch {
    }
    return [];
  }
}

export async function loadCloudEngineProject(
  uid: string,
  chatId: string
): Promise<CloudEngineProject | null> {
  const activeUid = await waitForCloudAuth(uid);
  if (!activeUid || !chatId) return null;
  const docId = sanitizeDocId(chatId);
  try {
    const snap = await getDoc(doc(db, "engine_projects", docId));
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    const owner = data.userId || data.user_id;
    if (owner && owner !== activeUid) return null;
    return {
      id: snap.id,
      userId: owner || activeUid,
      title: String(data.title || "Engine project"),
      projectId: data.projectId ?? data.project_id ?? null,
      activeFile: String(data.activeFile || "src/App.tsx"),
      files: (data.files && typeof data.files === "object" ? data.files : {}) as Record<string, string>,
      chatMessages: Array.isArray(data.chatMessages) ? data.chatMessages : [],
      createdAt: String(data.createdAt || new Date().toISOString()),
      updatedAt: String(data.updatedAt || new Date().toISOString()),
    };
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.GET, `engine_projects/${docId}`);
    } catch {
    }
    return null;
  }
}

export async function saveCloudEngineProject(
  uid: string,
  input: {
    id: string;
    title: string;
    projectId?: string | null;
    activeFile?: string;
    files: Record<string, string>;
    chatMessages: CloudEngineMessage[];
  }
): Promise<void> {
  const activeUid = await waitForCloudAuth(uid);
  if (!activeUid || !input.id) return;
  const docId = sanitizeDocId(input.id);
  const now = new Date().toISOString();

  const sanitizedFiles: Record<string, string> = {};
  let totalBytes = 0;
  for (const [k, v] of Object.entries(input.files || {})) {
    const val = typeof v === "string" ? v : String(v ?? "");
    if (totalBytes + val.length > 750_000) continue;
    sanitizedFiles[k] = val;
    totalBytes += val.length;
  }

  const trimmedMessages = (input.chatMessages || []).slice(-200).map((m) => ({
    id: String(m.id || `msg_${Date.now()}`),
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    content: String(m.content || "").slice(0, 60_000),
    ...(Array.isArray(m.filesUpdated) && m.filesUpdated.length > 0
      ? { filesUpdated: m.filesUpdated.slice(0, 50) }
      : {}),
    ...(m.limitCooldown
      ? {
          limitCooldown: {
            scope: m.limitCooldown.scope,
            ...(m.limitCooldown.used !== undefined ? { used: m.limitCooldown.used } : {}),
            ...(m.limitCooldown.limit !== undefined ? { limit: m.limitCooldown.limit } : {}),
            resetAt: m.limitCooldown.resetAt,
          },
        }
      : {}),
  }));

  const payload = cleanFirestorePayload({
    userId: activeUid,
    user_id: activeUid,
    title: (input.title || "Engine project").slice(0, 200),
    projectId: input.projectId ?? null,
    activeFile: (input.activeFile || "src/App.tsx").slice(0, 260),
    files: sanitizedFiles,
    chatMessages: trimmedMessages,
    updatedAt: now,
    createdAt: now,
  });

  try {
    const ref = doc(db, "engine_projects", docId);
    const existing = await getDoc(ref).catch(() => null);
    if (existing?.exists()) {
      const prevCreated = (existing.data() as any)?.createdAt;
      if (prevCreated) payload.createdAt = prevCreated;
    }
    await setDoc(ref, payload, { merge: true });
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, `engine_projects/${docId}`);
    } catch {
    }
  }
}

export async function deleteCloudEngineProject(uid: string, chatId: string): Promise<void> {
  const activeUid = await waitForCloudAuth(uid);
  if (!activeUid || !chatId) return;
  const docId = sanitizeDocId(chatId);
  try {
    await deleteDoc(doc(db, "engine_projects", docId));
  } catch {
  }
}

export async function deleteCloudAndLocalChat(
  uid: string,
  chatId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!chatId) return { ok: false, error: "Missing chatId" };

  if (typeof window !== "undefined") {
    try {
      const guestRaw = window.localStorage.getItem("igseek:guest-store");
      if (guestRaw) {
        const guest = JSON.parse(guestRaw);
        if (Array.isArray(guest?.chats)) {
          guest.chats = guest.chats.filter((c: any) => c?.id !== chatId);
        }
        if (guest?.messages && typeof guest.messages === "object") {
          delete guest.messages[chatId];
        }
        window.localStorage.setItem("igseek:guest-store", JSON.stringify(guest));
      }
    } catch {
    }

    try {
      const localChatsRaw = window.localStorage.getItem("igseek:local_db:chats");
      if (localChatsRaw) {
        const localChats = JSON.parse(localChatsRaw);
        if (localChats && typeof localChats === "object") {
          delete localChats[chatId];
          window.localStorage.setItem("igseek:local_db:chats", JSON.stringify(localChats));
        }
      }
      const localMsgsRaw = window.localStorage.getItem("igseek:local_db:chat_messages");
      if (localMsgsRaw) {
        const localMsgs = JSON.parse(localMsgsRaw);
        if (localMsgs && typeof localMsgs === "object") {
          for (const [k, v] of Object.entries<any>(localMsgs)) {
            if (v?.chat_id === chatId || v?.chatId === chatId) {
              delete localMsgs[k];
            }
          }
          window.localStorage.setItem("igseek:local_db:chat_messages", JSON.stringify(localMsgs));
        }
      }
    } catch {
    }

    try {
      window.localStorage.removeItem(`${ENGINE_PROJ_PREFIX}${chatId}`);
      const idsRaw = window.localStorage.getItem(ENGINE_CHAT_IDS_KEY);
      if (idsRaw) {
        const arr = JSON.parse(idsRaw);
        if (Array.isArray(arr)) {
          window.localStorage.setItem(
            ENGINE_CHAT_IDS_KEY,
            JSON.stringify(arr.filter((x: string) => x !== chatId))
          );
        }
      }
    } catch {
    }
  }

  const activeUid = await waitForCloudAuth(uid);
  if (!activeUid) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("igseek:library-updated"));
    }
    return { ok: true };
  }

  try {
    const msgRefs: Array<ReturnType<typeof doc>> = [];
    const seenMsgIds = new Set<string>();
    for (const ownerField of ["user_id", "userId"] as const) {
      try {
        const snap = await getDocs(
          query(collection(db, "chat_messages"), where(ownerField, "==", activeUid))
        );
        for (const d of snap.docs) {
          if (seenMsgIds.has(d.id)) continue;
          const data = d.data() as any;
          if (data?.chat_id === chatId || data?.chatId === chatId) {
            seenMsgIds.add(d.id);
            msgRefs.push(d.ref);
          }
        }
      } catch {
      }
    }
    await Promise.all(msgRefs.map((ref) => deleteDoc(ref).catch(() => {})));

    try {
      const subSnap = await getDocs(collection(db, "chats", chatId, "messages"));
      await Promise.all(subSnap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
    } catch {
    }

    await deleteCloudEngineProject(activeUid, chatId);

    try {
      await deleteDoc(doc(db, "chats", chatId));
    } catch (err: any) {
      const code = String(err?.code || "");
      const msg = String(err?.message || "");
      let stillExists = false;
      if (code === "not-found" || code === "permission-denied" || msg.includes("permission")) {
        for (const ownerField of ["user_id", "userId"] as const) {
          try {
            const snap = await getDocs(
              query(collection(db, "chats"), where(ownerField, "==", activeUid))
            );
            const hit = snap.docs.find((d) => d.id === chatId);
            if (hit) {
              stillExists = true;
              await deleteDoc(hit.ref);
              stillExists = false;
              break;
            }
          } catch {
          }
        }
      } else {
        stillExists = true;
      }

      if (stillExists) {
        try {
          handleFirestoreError(err, OperationType.DELETE, `chats/${chatId}`);
        } catch {
        }
        return { ok: false, error: msg || "Cloud delete failed" };
      }
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("igseek:library-updated"));
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to delete chat" };
  }
}

// ─── Real-Time Library Files Sync ────────────────────────────────────────────

export function subscribeCloudLibraryFiles(
  uid: string,
  onFiles: (files: SyncedLibraryFile[]) => void
): Unsubscribe {
  return subscribeDualOwnerCollection("library_files", uid, (docs) => {
    const list: SyncedLibraryFile[] = docs
      .map(({ id, data }) => ({
        id,
        name: String(data.name || "file.txt"),
        type: String(data.type || "document"),
        content: String(data.content || ""),
        projectId: (data.projectId ?? data.project_id ?? null) as string | null,
        taskId: data.taskId || undefined,
        taskTitle: data.taskTitle || undefined,
        source: "flow" as const,
        createdAt: String(data.createdAt || data.created_at || new Date().toISOString()),
        updatedAt: String(data.updatedAt || data.updated_at || data.createdAt || new Date().toISOString()),
      }))
      .sort((a, b) => parseIsoMs(b.updatedAt) - parseIsoMs(a.updatedAt));
    onFiles(list);
  });
}

export async function upsertCloudLibraryFiles(
  uid: string,
  files: SyncedLibraryFile[]
): Promise<{ synced: number; failed: number }> {
  const activeUid = await waitForCloudAuth(uid);
  if (!activeUid || !files.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  await Promise.all(
    files.map(async (f) => {
      if (!f.id || !f.name) return;
      const docId = sanitizeDocId(f.id);
      const content = typeof f.content === "string" ? f.content : String(f.content ?? "");
      const safeContent = content.length > 850_000 ? content.slice(0, 850_000) : content;
      const now = new Date().toISOString();
      const payload = cleanFirestorePayload({
        userId: activeUid,
        user_id: activeUid,
        name: f.name.slice(0, 260),
        type: (f.type || "document").slice(0, 50),
        content: safeContent,
        projectId: f.projectId ?? null,
        taskId: f.taskId ?? null,
        taskTitle: f.taskTitle ? f.taskTitle.slice(0, 200) : null,
        source: "flow",
        createdAt: f.createdAt || now,
        updatedAt: f.updatedAt || now,
      });
      try {
        await setDoc(doc(db, "library_files", docId), payload, { merge: true });
        synced += 1;
      } catch (err) {
        failed += 1;
        try {
          handleFirestoreError(err, OperationType.WRITE, `library_files/${docId}`);
        } catch {
        }
      }
    }),
  );

  return { synced, failed };
}

export async function renameCloudLibraryFile(
  uid: string,
  fileId: string,
  newName: string
): Promise<boolean> {
  const activeUid = await waitForCloudAuth(uid);
  if (!activeUid || !fileId || !newName) return false;
  const docId = sanitizeDocId(fileId);
  try {
    await updateDoc(doc(db, "library_files", docId), {
      name: newName.slice(0, 260),
      updatedAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.UPDATE, `library_files/${docId}`);
    } catch {
    }
    return false;
  }
}

export async function deleteCloudLibraryFile(uid: string, fileId: string): Promise<boolean> {
  const activeUid = await waitForCloudAuth(uid);
  if (!activeUid || !fileId) return false;
  const docId = sanitizeDocId(fileId);
  try {
    await deleteDoc(doc(db, "library_files", docId));
    return true;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.DELETE, `library_files/${docId}`);
    } catch {
    }
    return false;
  }
}

export async function fetchCloudChatMessagesForLibrary(
  uid: string
): Promise<CloudChatMessageForLibrary[]> {
  const activeUid = await waitForCloudAuth(uid);
  if (!activeUid) return [];
  try {
    const [snakeSnap, camelSnap] = await Promise.all([
      getDocs(query(collection(db, "chat_messages"), where("user_id", "==", activeUid))).catch(() => null),
      getDocs(query(collection(db, "chat_messages"), where("userId", "==", activeUid))).catch(() => null),
    ]);
    const seen = new Set<string>();
    const items: CloudChatMessageForLibrary[] = [];
    const processSnap = (snap: any) => {
      if (!snap) return;
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const data = d.data() as any;
        const content = String(data.content || "");
        const hasInlineDataUrl = /!\[[^\]]*\]\(data:[^)]+\)/.test(content);
        const images = Array.isArray(data.images) ? data.images : undefined;
        const artifacts = Array.isArray(data.artifacts) ? data.artifacts : undefined;
        if (hasInlineDataUrl || (images && images.length > 0) || (artifacts && artifacts.length > 0)) {
          items.push({
            id: d.id,
            chatId: String(data.chat_id || data.chatId || ""),
            content,
            images,
            artifacts,
          });
        }
      }
    };
    processSnap(snakeSnap);
    processSnap(camelSnap);
    return items;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.LIST, "chat_messages");
    } catch {
    }
    return [];
  }
}

export async function renameCloudChatMediaItem(
  msgId: string,
  oldName: string,
  newName: string
): Promise<boolean> {
  if (!msgId || !oldName || !newName) return false;
  const activeUid = await waitForCloudAuth();
  if (!activeUid) return false;
  try {
    const ref = doc(db, "chat_messages", msgId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const data = snap.data() as any;
    let content = String(data.content || "");
    if (content.includes(`![${oldName}]`)) {
      content = content.replaceAll(`![${oldName}]`, `![${newName}]`);
    }
    const images = Array.isArray(data.images)
      ? data.images.map((img: any) => (img?.title === oldName ? { ...img, title: newName } : img))
      : undefined;
    const artifacts = Array.isArray(data.artifacts)
      ? data.artifacts.map((art: any) => (art?.title === oldName ? { ...art, title: newName } : art))
      : undefined;

    const patch: Record<string, any> = { content };
    if (images !== undefined) patch.images = images;
    if (artifacts !== undefined) patch.artifacts = artifacts;
    await updateDoc(ref, patch);
    return true;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.UPDATE, `chat_messages/${msgId}`);
    } catch {
    }
    return false;
  }
}

export async function deleteCloudChatMediaItem(
  msgId: string,
  fileName: string
): Promise<boolean> {
  if (!msgId || !fileName) return false;
  const activeUid = await waitForCloudAuth();
  if (!activeUid) return false;
  try {
    const ref = doc(db, "chat_messages", msgId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const data = snap.data() as any;
    let content = String(data.content || "");
    const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    content = content.replace(new RegExp(`!\\[${escaped}\\]\\(data:[^)]+\\)\\n?`, "g"), "").trim();
    const images = Array.isArray(data.images)
      ? data.images.filter((img: any) => img?.title !== fileName)
      : undefined;
    const artifacts = Array.isArray(data.artifacts)
      ? data.artifacts.filter(
          (art: any) => art?.title !== fileName && `${art?.title}.${art?.language}` !== fileName
        )
      : undefined;

    const patch: Record<string, any> = { content };
    if (images !== undefined) patch.images = images;
    if (artifacts !== undefined) patch.artifacts = artifacts;
    await updateDoc(ref, patch);
    return true;
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.UPDATE, `chat_messages/${msgId}`);
    } catch {
    }
    return false;
  }
}
