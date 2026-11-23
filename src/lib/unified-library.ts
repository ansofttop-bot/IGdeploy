import {
  fetchCloudChatMessagesForLibrary,
  upsertCloudLibraryFiles,
  waitForCloudAuth,
  type CloudChatMessageForLibrary,
} from "./cloud-sync";
import { firebaseClient } from "./firebase-service";
import { getFlowSessionId, readFlowLibraryFiles, upsertFlowLibraryFiles } from "./flow-library-store";
import { compressBrowserImageDataUrl, guessMimeTypeFromName } from "./mime-utils";
import { isRichDocumentExtension, looksCorruptedBinaryString, sanitizeTextForApi } from "./word-parser";

export type UnifiedLibraryItem = {
  id: string;
  name: string;
  type: "image" | "doc" | "artifact";
  mimeType: string;
  dataUrl?: string;
  content?: string;
  chatId: string;
  chatTitle: string;
  messageId: string;
  timestamp?: string;
  source: "user_upload" | "generated" | "artifact" | "flow";
  snippet?: string;
  flowFileId?: string;
  projectId?: string | null;
};

export const guessMimeType = guessMimeTypeFromName;

export function utf8ToBase64(text: string): string {
  try {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch {
    return btoa(unescape(encodeURIComponent(text)));
  }
}

export function toBase64DataUrlFromItem(item: Pick<UnifiedLibraryItem, "name" | "mimeType" | "content" | "dataUrl">): string | undefined {
  if (item.dataUrl && item.dataUrl.startsWith("data:")) {
    const commaIdx = item.dataUrl.indexOf(",");
    if (commaIdx !== -1) {
      const meta = item.dataUrl.slice(5, commaIdx);
      const body = item.dataUrl.slice(commaIdx + 1);
      if (meta.includes(";base64")) return item.dataUrl;
      try {
        const decoded = decodeURIComponent(body);
        const mime = meta.split(";")[0] || item.mimeType || guessMimeType(item.name);
        return `data:${mime};base64,${utf8ToBase64(decoded)}`;
      } catch {
        return item.dataUrl;
      }
    }
  }
  if (typeof item.content === "string") {
    const mime = item.mimeType || guessMimeType(item.name);
    return `data:${mime};base64,${utf8ToBase64(item.content)}`;
  }
  return undefined;
}

function readGuestMessagesMap(): Record<string, any[]> {
  try {
    const raw = window.localStorage.getItem("igseek:guest-store");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed?.messages && typeof parsed.messages === "object" ? parsed.messages : {};
  } catch {
    return {};
  }
}

export function collectLocalUnifiedLibrary(opts?: {
  userId?: string | null;
  chats?: Array<{ id: string; title: string }>;
  projects?: Array<{ id: string; name: string }>;
  cloudMediaMsgs?: CloudChatMessageForLibrary[];
}): UnifiedLibraryItem[] {
  const list: UnifiedLibraryItem[] = [];
  const seen = new Set<string>();
  const projNameMap = new Map<string, string>();
  (opts?.projects || []).forEach((p) => projNameMap.set(p.id, p.name));
  const chatTitleMap = new Map<string, string>();
  (opts?.chats || []).forEach((c) => chatTitleMap.set(c.id, c.title));

  for (const ff of readFlowLibraryFiles()) {
    const isDataUrl = typeof ff.content === "string" && ff.content.startsWith("data:");
    const isCorrupted = typeof ff.content === "string" && looksCorruptedBinaryString(ff.content);
    const mappedType: "image" | "doc" | "artifact" =
      ff.type === "image" || (isDataUrl && ff.content.startsWith("data:image/"))
        ? "image"
        : ff.type === "code" || ff.type === "data" || ff.type === "artifact"
          ? "artifact"
          : "doc";
    const projLabel = ff.projectId ? projNameMap.get(ff.projectId) || "Project" : null;
    const key = `flow:${ff.id}:${ff.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      id: ff.id,
      flowFileId: ff.id,
      name: ff.name,
      type: mappedType,
      mimeType: guessMimeType(ff.name, mappedType === "image" ? "image/png" : "text/plain"),
      ...(isDataUrl
        ? { dataUrl: ff.content }
        : isCorrupted
          ? {}
          : {
              content: ff.content,
              dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(ff.content || "")}`,
            }),
      chatId: "",
      chatTitle: ff.taskTitle
        ? `${ff.taskTitle}${projLabel ? ` (${projLabel})` : ""}`
        : `Library${projLabel ? ` (${projLabel})` : ""}`,
      messageId: "",
      timestamp: ff.updatedAt,
      source: "flow",
      snippet: isDataUrl || isCorrupted ? ff.name : (ff.content || "").slice(0, 140),
      projectId: ff.projectId,
    });
  }

  const appendMessagesMedia = (
    chatId: string,
    msgs: Array<{ id: string; content?: string; images?: any[]; artifacts?: any[]; created_at?: string }>,
  ) => {
    const title = chatTitleMap.get(chatId) || "Chat";
    for (const m of msgs) {
      if (!m) continue;
      if (m.content) {
        const matches = [...m.content.matchAll(/!\[([^\]]*)\]\((data:[^)]+)\)/g)];
        for (const match of matches) {
          const name = match[1] || "attachment";
          const dataUrl = match[2];
          const isImg = dataUrl.startsWith("data:image/");
          const mimeMatch = dataUrl.match(/^data:([^;]+);/);
          const id = `${m.id}_${name}`;
          if (seen.has(id)) continue;
          seen.add(id);
          list.push({
            id,
            name,
            type: isImg ? "image" : "doc",
            mimeType: mimeMatch?.[1] || guessMimeType(name),
            dataUrl,
            chatId,
            chatTitle: title,
            messageId: m.id,
            timestamp: m.created_at,
            source: "user_upload",
          });
        }
      }
      if (Array.isArray(m.images)) {
        for (const img of m.images) {
          if (!img?.dataUrl) continue;
          const id = img.id || `${m.id}_img`;
          if (seen.has(id)) continue;
          seen.add(id);
          list.push({
            id,
            name: img.title || "generated_image.png",
            type: "image",
            mimeType: "image/png",
            dataUrl: img.dataUrl,
            chatId,
            chatTitle: title,
            messageId: m.id,
            timestamp: m.created_at,
            source: "generated",
            snippet: img.prompt,
          });
        }
      }
      if (Array.isArray(m.artifacts)) {
        for (const art of m.artifacts) {
          const name = art.title
            ? art.title.includes(".")
              ? art.title
              : `${art.title}.${art.language || "txt"}`
            : "artifact.txt";
          const id = art.id || `${m.id}_art_${name}`;
          if (seen.has(id)) continue;
          seen.add(id);
          list.push({
            id,
            name,
            type: "artifact",
            mimeType: guessMimeType(name, "text/plain"),
            content: art.content || "",
            dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(art.content || "")}`,
            chatId,
            chatTitle: title,
            messageId: m.id,
            timestamp: m.created_at,
            source: "artifact",
            snippet: art.description || art.content?.slice(0, 80),
          });
        }
      }
    }
  };

  if (opts?.cloudMediaMsgs && opts.cloudMediaMsgs.length > 0) {
    const byChat = new Map<string, CloudChatMessageForLibrary[]>();
    for (const msg of opts.cloudMediaMsgs) {
      const cid = msg.chatId || "cloud";
      const arr = byChat.get(cid) ?? [];
      arr.push(msg);
      byChat.set(cid, arr);
    }
    for (const [cid, msgs] of byChat.entries()) {
      appendMessagesMedia(cid, msgs);
    }
  }

  const guestMsgs = readGuestMessagesMap();
  for (const [chatId, msgs] of Object.entries(guestMsgs)) {
    if (!Array.isArray(msgs)) continue;
    appendMessagesMedia(chatId, msgs);
  }

  return list;
}

export async function fetchUnifiedLibraryItems(opts?: {
  userId?: string | null;
  chats?: Array<{ id: string; title: string }>;
  projects?: Array<{ id: string; name: string }>;
}): Promise<UnifiedLibraryItem[]> {
  let cloudMediaMsgs: CloudChatMessageForLibrary[] = [];
  if (opts?.userId && opts.userId !== "guest" && !opts.userId.startsWith("local_")) {
    cloudMediaMsgs = await fetchCloudChatMessagesForLibrary(opts.userId).catch(() => []);
  }
  const localItems = collectLocalUnifiedLibrary({ ...opts, cloudMediaMsgs });

  // Local storage is the immediate source of truth for the Library UI.
  // Cloud synchronization is best-effort and must never undo a successful local save.
  try {
    const { data } = await firebaseClient.auth.getSession();
    const token = data.session?.access_token;
    const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
    const res = await fetch("/api/library", { headers });
    if (res.ok) {
      const json = (await res.json()) as { items?: any[] };
      if (Array.isArray(json.items)) {
        const seenNames = new Set(localItems.map((i) => `${i.name.toLowerCase()}::${i.source}`));
        for (const srv of json.items) {
          if (!srv?.name) continue;
          const k = `${String(srv.name).toLowerCase()}::${srv.source || "flow"}`;
          if (seenNames.has(k)) continue;
          seenNames.add(k);
          localItems.push({
            id: String(srv.id || `srv_${srv.name}`),
            name: String(srv.name),
            type: srv.type === "image" ? "image" : srv.type === "artifact" ? "artifact" : "doc",
            mimeType: String(srv.mimeType || guessMimeType(srv.name)),
            content: srv.content,
            dataUrl: srv.dataUrl,
            chatId: "",
            chatTitle: String(srv.chatTitle || "Library"),
            messageId: "",
            timestamp: srv.updatedAt,
            source: srv.source === "flow" || srv.source === "user_upload" || srv.source === "generated" || srv.source === "artifact"
              ? srv.source
              : "flow",
            snippet: typeof srv.content === "string" ? srv.content.slice(0, 140) : srv.name,
          });
        }
      }
    }
  } catch {
  }

  return localItems;
}

export function buildChatLibraryPayload(
  items: UnifiedLibraryItem[],
  opts?: { metadataOnly?: boolean },
) {
  const metadataOnly = Boolean(opts?.metadataOnly);
  if (metadataOnly) {
    return items.slice(0, 25).map((item) => {
      const preview =
        typeof item.content === "string" &&
        !item.content.startsWith("data:") &&
        !looksCorruptedBinaryString(item.content)
          ? sanitizeTextForApi(item.content).slice(0, 180)
          : undefined;
      return {
        id: item.id,
        name: item.name,
        type: item.type,
        mimeType: item.mimeType,
        source: item.source,
        chatTitle: item.chatTitle,
        updatedAt: item.timestamp,
        ...(preview ? { content: preview } : {}),
      };
    });
  }

  let binaryDataUrlBudget = 2;
  return items.slice(0, 35).map((item) => {
    const validText =
      typeof item.content === "string" &&
      !item.content.startsWith("data:") &&
      !looksCorruptedBinaryString(item.content)
        ? sanitizeTextForApi(item.content).slice(0, 40_000)
        : undefined;
    const isSmallOrUnparsedBinary =
      Boolean(item.dataUrl) &&
      !validText &&
      item.type !== "image" &&
      item.dataUrl!.length <= 650_000 &&
      binaryDataUrlBudget > 0;
    if (isSmallOrUnparsedBinary) {
      binaryDataUrlBudget -= 1;
    }
    const includeDataUrl =
      Boolean(item.dataUrl) &&
      (isSmallOrUnparsedBinary ||
        ((!validText || item.type === "image") && item.dataUrl!.length <= 280_000));
    return {
      id: item.id,
      name: item.name,
      type: item.type,
      mimeType: item.mimeType,
      source: item.source,
      chatTitle: item.chatTitle,
      updatedAt: item.timestamp,
      ...(validText !== undefined ? { content: validText } : {}),
      ...(includeDataUrl ? { dataUrl: item.dataUrl } : {}),
    };
  });
}

export async function addFileToUnifiedLibrary(
  file: File,
  opts?: { projectId?: string | null; taskTitle?: string },
): Promise<UnifiedLibraryItem> {
  const isText =
    !isRichDocumentExtension(file.name) &&
    !file.name.toLowerCase().endsWith(".pdf") &&
    (file.type.startsWith("text/") ||
      /\.(txt|md|json|csv|tsv|js|ts|tsx|jsx|py|d|di|c|h|cpp|rs|go|java|html|css|xml|yaml|yml|log|sql|sh|env)$/i.test(file.name));
  const isExtractableDoc = isRichDocumentExtension(file.name) || file.name.toLowerCase().endsWith(".pdf");

  let textContent: string | undefined;
  let dataUrl: string | undefined;

  if (isText && file.size <= 512 * 1024) {
    textContent = sanitizeTextForApi(await file.text());
    dataUrl = `data:${guessMimeType(file.name, file.type || "text/plain")};base64,${utf8ToBase64(textContent)}`;
  } else {
    const readDataUrlPromise = new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(file);
    });
    if (isExtractableDoc && file.size <= 25 * 1024 * 1024) {
      try {
        const [{ parseAttachment }, rawDataUrl] = await Promise.all([
          import("./file-parsers"),
          readDataUrlPromise.catch(() => ""),
        ]);
        dataUrl = rawDataUrl;
        const parsedRes = await parseAttachment(file);
        if (parsedRes?.content && !parsedRes.content.startsWith("📎") && !looksCorruptedBinaryString(parsedRes.content)) {
          textContent = parsedRes.content;
        }
      } catch {
        if (!dataUrl) {
          dataUrl = await readDataUrlPromise.catch(() => "");
        }
      }
    } else {
      dataUrl = await readDataUrlPromise;
    }
  }

  if (dataUrl && file.type.startsWith("image/") && dataUrl.length > 680_000) {
    dataUrl = await compressBrowserImageDataUrl(dataUrl, 1400, 680_000);
  }

  const storedContent = textContent !== undefined ? textContent : (dataUrl || "");
  const lowerName = file.name.toLowerCase();
  const isCodeArtifact = /\.(html?|css|js|jsx|ts|tsx|py|d|di|c|cpp|h|rs|go|java|json|ya?ml|md|sql|sh|xml|csv|tsv|log|env)$/i.test(lowerName);
  const fileType = file.type.startsWith("image/")
    ? "image"
    : isCodeArtifact
      ? "artifact"
      : "document";

  const safeStoredContent =
    storedContent.startsWith("data:") && storedContent.length > 840_000
      ? storedContent
      : storedContent.slice(0, 840_000);

  const updated = upsertFlowLibraryFiles(
    [
      {
        name: file.name,
        type: fileType,
        content: safeStoredContent,
        projectId: opts?.projectId ?? null,
        taskTitle: opts?.taskTitle || "Library",
      },
    ],
    { skipCloudSync: true },
  );

  const savedEntry = updated.find((u) => u.name === file.name) || updated[0];

  // Persist directly to Firestore first (awaited) so cloud sync is guaranteed before returning.
  try {
    const cloudUid = await waitForCloudAuth();
    if (cloudUid && savedEntry) {
      await upsertCloudLibraryFiles(cloudUid, [savedEntry]);
    }
  } catch {
  }

  // Also notify server endpoints in parallel so Flow tools & server cache see the new file immediately.
  try {
    const { data } = await firebaseClient.auth.getSession();
    const token = data.session?.access_token;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
    void Promise.allSettled([
      fetch("/api/library", {
        method: "POST",
        headers,
        body: JSON.stringify({
          id: savedEntry?.id,
          name: file.name,
          type: file.type.startsWith("image/") ? "image" : fileType === "artifact" ? "artifact" : "doc",
          mimeType: guessMimeType(file.name, file.type || "text/plain"),
          ...(textContent !== undefined ? { content: textContent.slice(0, 800_000) } : {}),
          ...(dataUrl && dataUrl.length <= 1_100_000 ? { dataUrl } : {}),
          size: file.size,
          source: "library",
          chatTitle: opts?.taskTitle || "Library",
        }),
      }),
      fetch("/api/flow", {
        method: "POST",
        headers: {
          ...headers,
          "x-guest-mode": token ? "false" : "true",
          ...(getFlowSessionId() ? { "x-flow-session": getFlowSessionId() } : {}),
        },
        body: JSON.stringify({
          action: "sync_library",
          projectId: opts?.projectId ?? null,
          files: [
            {
              name: file.name,
              ...(dataUrl ? { dataUrl } : {}),
              ...(textContent !== undefined ? { content: textContent } : {}),
            },
          ],
        }),
      }),
    ]);
  } catch {
  }

  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("igseek:library-updated"));
    }
  } catch {}

  return {
    id: savedEntry?.id || `lib_${Date.now()}`,
    flowFileId: savedEntry?.id,
    name: file.name,
    type: file.type.startsWith("image/") ? "image" : fileType === "artifact" ? "artifact" : "doc",
    mimeType: guessMimeType(file.name, file.type || "text/plain"),
    ...(textContent !== undefined ? { content: textContent } : {}),
    ...(dataUrl ? { dataUrl } : {}),
    chatId: "",
    chatTitle: opts?.taskTitle || "Library",
    messageId: "",
    timestamp: savedEntry?.updatedAt || new Date().toISOString(),
    source: "flow",
    snippet: textContent ? textContent.slice(0, 140) : file.name,
  };
}
