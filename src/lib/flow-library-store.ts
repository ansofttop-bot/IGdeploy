import {
  getActiveCloudUid,
  waitForCloudAuth,
  upsertCloudLibraryFiles,
  renameCloudLibraryFile,
  deleteCloudLibraryFile,
} from "./cloud-sync";

export const FLOW_LIBRARY_STORAGE_KEY = "igseek:flow_library_files";
export const FLOW_SESSION_KEY = "igseek:flow_session_id";

// Track recently uploaded/mutated IDs so an initial empty/stale cloud snapshot
// never wipes a file that is currently in-flight to Firestore.
const pendingLocalUploads = new Map<string, { file: StoredFlowLibraryFile; expiresAt: number }>();
const recentlyDeletedIds = new Map<string, number>();

export function getFlowSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(FLOW_SESSION_KEY);
    if (!id || !/^[a-zA-Z0-9._-]{8,80}$/.test(id)) {
      id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `fs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(FLOW_SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export interface StoredFlowLibraryFile {
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

export function readFlowLibraryFiles(): StoredFlowLibraryFile[] {
  try {
    const raw = localStorage.getItem(FLOW_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeFlowLibraryFiles(files: StoredFlowLibraryFile[]): void {
  try {
    localStorage.setItem(FLOW_LIBRARY_STORAGE_KEY, JSON.stringify(files));
  } catch {
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("igseek:library-updated"));
  }
}

/**
 * Reconciles incoming cloud library files with local storage:
 * - Preserves any in-flight local uploads not yet reflected in the snapshot
 * - Filters out items recently deleted locally while delete is propagating
 * - On initial sync, pushes any pre-existing local files missing from cloud
 */
let initialBackfillDoneForUid: string | null = null;

export function replaceFlowLibraryFilesFromCloud(cloudFiles: StoredFlowLibraryFile[]): void {
  const now = Date.now();
  const activeUid = getActiveCloudUid();

  for (const [id, exp] of recentlyDeletedIds.entries()) {
    if (exp < now) recentlyDeletedIds.delete(id);
  }
  for (const [id, entry] of pendingLocalUploads.entries()) {
    if (entry.expiresAt < now) pendingLocalUploads.delete(id);
  }

  const byId = new Map<string, StoredFlowLibraryFile>();
  for (const cf of cloudFiles) {
    if (recentlyDeletedIds.has(cf.id)) continue;
    byId.set(cf.id, cf);
    pendingLocalUploads.delete(cf.id);
  }

  // Keep in-flight local uploads until Firestore echoes them back
  for (const [id, pending] of pendingLocalUploads.entries()) {
    if (!byId.has(id) && !recentlyDeletedIds.has(id)) {
      byId.set(id, pending.file);
    }
  }

  // One-time safe backfill of local files created before auth finished hydrating
  if (activeUid && initialBackfillDoneForUid !== activeUid) {
    initialBackfillDoneForUid = activeUid;
    const localExisting = readFlowLibraryFiles();
    const missingInCloud: StoredFlowLibraryFile[] = [];
    for (const lf of localExisting) {
      if (!byId.has(lf.id) && !recentlyDeletedIds.has(lf.id)) {
        byId.set(lf.id, lf);
        missingInCloud.push(lf);
      }
    }
    if (missingInCloud.length > 0) {
      void upsertCloudLibraryFiles(activeUid, missingInCloud);
    }
  }

  const sorted = Array.from(byId.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  writeFlowLibraryFiles(sorted);
}

export function upsertFlowLibraryFiles(
  incoming: Array<{
    name: string;
    type?: string;
    content: string;
    projectId?: string | null;
    taskId?: string;
    taskTitle?: string;
  }>,
  opts?: { skipCloudSync?: boolean },
): StoredFlowLibraryFile[] {
  const existing = readFlowLibraryFiles();
  const now = new Date().toISOString();
  const map = new Map<string, StoredFlowLibraryFile>();

  for (const item of existing) {
    const key = `${item.projectId || ""}::${item.name}`;
    map.set(key, item);
  }

  const changedItems: StoredFlowLibraryFile[] = [];

  for (const item of incoming) {
    if (!item.name || item.content === undefined) continue;
    const proj = item.projectId ?? null;
    const key = `${proj || ""}::${item.name}`;
    const prev = map.get(key);
    const sameContent =
      prev &&
      prev.content === item.content &&
      prev.type === (item.type || prev.type || "document");
    const entry: StoredFlowLibraryFile = {
      id: prev?.id || `flowfile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: item.name,
      type: item.type || prev?.type || "document",
      content: item.content,
      projectId: proj,
      taskId: item.taskId ?? prev?.taskId,
      taskTitle: item.taskTitle ?? prev?.taskTitle,
      source: "flow",
      createdAt: prev?.createdAt || now,
      updatedAt: sameContent && prev?.updatedAt ? prev.updatedAt : now,
    };
    map.set(key, entry);
    if (!sameContent) {
      changedItems.push(entry);
      pendingLocalUploads.set(entry.id, { file: entry, expiresAt: Date.now() + 20_000 });
      recentlyDeletedIds.delete(entry.id);
    }
  }

  const next = Array.from(map.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  writeFlowLibraryFiles(next);

  if (!opts?.skipCloudSync && changedItems.length > 0) {
    void waitForCloudAuth().then((cloudUid) => {
      if (cloudUid) {
        void upsertCloudLibraryFiles(cloudUid, changedItems);
      }
    });
  }

  return next;
}

export function renameStoredFlowLibraryFile(id: string, newName: string): StoredFlowLibraryFile | null {
  const existing = readFlowLibraryFiles();
  let target: StoredFlowLibraryFile | null = null;
  const next = existing.map((f) => {
    if (f.id === id) {
      target = { ...f, name: newName, updatedAt: new Date().toISOString() };
      return target;
    }
    return f;
  });
  if (target) {
    pendingLocalUploads.set(id, { file: target, expiresAt: Date.now() + 15_000 });
    writeFlowLibraryFiles(next);
    void waitForCloudAuth().then((cloudUid) => {
      if (cloudUid) {
        void renameCloudLibraryFile(cloudUid, id, newName);
      }
    });
  }
  return target;
}

export function deleteStoredFlowLibraryFile(id: string): StoredFlowLibraryFile | null {
  const existing = readFlowLibraryFiles();
  const target = existing.find((f) => f.id === id) || null;
  if (!target) return null;
  pendingLocalUploads.delete(id);
  recentlyDeletedIds.set(id, Date.now() + 20_000);
  writeFlowLibraryFiles(existing.filter((f) => f.id !== id));

  void waitForCloudAuth().then((cloudUid) => {
    if (cloudUid) {
      void deleteCloudLibraryFile(cloudUid, id);
    }
  });

  return target;
}
