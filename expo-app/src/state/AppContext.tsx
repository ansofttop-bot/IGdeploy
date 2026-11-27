import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  executeFlowStep,
  fetchSubscription,
  generateEngineProject,
  planFlow,
  redeemLicenseKey,
  streamChat,
} from "../services/api";
import {
  createGuestSession,
  refreshAuthSession,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "../services/firebaseAuth";
import * as Sync from "../services/firestoreSync";
import { AppColors, getThemeColors } from "../theme/theme";
import {
  AccentPresetId,
  AgentRoleId,
  AiModelId,
  AppPrefs,
  AuthSession,
  ChatAttachment,
  ChatMessageItem,
  ChatThread,
  EngineProjectItem,
  FlowAutonomy,
  FlowTaskState,
  IGseekTab,
  LibraryFileItem,
  MemoryEntryItem,
  ProjectFolder,
  SubscriptionInfo,
} from "../types/models";

const STORAGE_KEYS = {
  SESSION: "igseek_expo_session_v1",
  PREFS: "igseek_expo_prefs_v1",
  CHATS: "igseek_expo_chats_v1",
  MESSAGES: "igseek_expo_messages_v1",
  PROJECTS: "igseek_expo_projects_v1",
  LIBRARY: "igseek_expo_library_v1",
  MEMORIES: "igseek_expo_memories_v1",
  ENGINE: "igseek_expo_engine_v1",
  SUBSCRIPTION: "igseek_expo_subscription_v1",
};

const DEFAULT_PREFS: AppPrefs = {
  theme: "dark",
  accent: "red",
  lang: "ru",
  model: "instinct",
  agent: "universal",
  hapticsEnabled: true,
};

const DEFAULT_SUBSCRIPTION: SubscriptionInfo = {
  plan: "free",
  isPro: false,
  status: "free",
  daysLeft: 0,
  expiresAt: null,
  lastKeyId: null,
  durationDays: 30,
};

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface AppContextValue {
  ready: boolean;
  session: AuthSession | null;
  prefs: AppPrefs;
  colors: AppColors;
  activeTab: IGseekTab;
  setActiveTab: (tab: IGseekTab) => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  proModalOpen: boolean;
  setProModalOpen: (v: boolean) => void;
  toast: string | null;
  showToast: (msg: string) => void;
  haptic: () => void;

  // Auth
  authBusy: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string, name: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;

  // Cloud Sync & Subscription
  syncing: boolean;
  lastSyncedAt: number | null;
  syncFromCloud: (overrideSession?: AuthSession) => Promise<void>;
  subscription: SubscriptionInfo;
  redeemKey: (key: string) => Promise<void>;

  // Preferences
  updatePrefs: (patch: Partial<AppPrefs>) => void;

  // Chats & Folders
  chats: ChatThread[];
  projects: ProjectFolder[];
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  activeChatId: string | null;
  activeMessages: ChatMessageItem[];
  messagesByChat: Record<string, ChatMessageItem[]>;
  streaming: boolean;
  draftPrompt: string;
  setDraftPrompt: (text: string) => void;
  createNewChat: (projectId?: string | null) => string;
  selectChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  toggleSaveChat: (chatId: string) => void;
  toggleBookmarkMessage: (chatId: string, msgId: string) => void;
  createProjectFolder: (name: string) => void;
  deleteProjectFolder: (id: string) => void;
  sendMessage: (opts: {
    text: string;
    webSearch: boolean;
    reasoning: boolean;
    imageMode: boolean;
    attachments: ChatAttachment[];
  }) => Promise<void>;
  stopStreaming: () => void;
  regenerateLast: (opts: { webSearch: boolean; reasoning: boolean }) => Promise<void>;

  // Flow
  flowTask: FlowTaskState | null;
  flowRunning: boolean;
  runFlowGoal: (goal: string, autonomy: FlowAutonomy) => Promise<void>;
  clearFlowTask: () => void;

  // Library
  libraryFiles: LibraryFileItem[];
  addLibraryFile: (item: Omit<LibraryFileItem, "id" | "updatedAt">) => void;
  removeLibraryFile: (id: string) => void;

  // Memories
  memories: MemoryEntryItem[];
  addMemory: (content: string, kind: MemoryEntryItem["kind"]) => void;
  removeMemory: (id: string) => void;

  // Engine
  engineProjects: EngineProjectItem[];
  activeEngineId: string | null;
  setActiveEngineId: (id: string | null) => void;
  engineBusy: boolean;
  buildEngineApp: (prompt: string, refineActive?: boolean) => Promise<void>;
  removeEngineProject: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [prefs, setPrefs] = useState<AppPrefs>(DEFAULT_PREFS);
  const [activeTab, setActiveTab] = useState<IGseekTab>("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [proModalOpen, setProModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo>(DEFAULT_SUBSCRIPTION);

  const [chats, setChats] = useState<ChatThread[]>([]);
  const [projects, setProjects] = useState<ProjectFolder[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messagesByChat, setMessagesByChat] = useState<Record<string, ChatMessageItem[]>>({});
  const [streaming, setStreaming] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState("");

  const [flowTask, setFlowTask] = useState<FlowTaskState | null>(null);
  const [flowRunning, setFlowRunning] = useState(false);

  const [libraryFiles, setLibraryFiles] = useState<LibraryFileItem[]>([]);
  const [memories, setMemories] = useState<MemoryEntryItem[]>([]);
  const [engineProjects, setEngineProjects] = useState<EngineProjectItem[]>([]);
  const [activeEngineId, setActiveEngineId] = useState<string | null>(null);
  const [engineBusy, setEngineBusy] = useState(false);

  const abortStreamRef = useRef<(() => void) | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colors = useMemo(
    () => getThemeColors(prefs.theme, prefs.accent),
    [prefs.theme, prefs.accent]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const haptic = useCallback(() => {
    if (!prefs.hapticsEnabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [prefs.hapticsEnabled]);

  const ensureFreshSession = useCallback(async (cur: AuthSession | null): Promise<AuthSession | null> => {
    if (!cur || cur.isGuest) return cur;
    const refreshed = await refreshAuthSession(cur);
    if (refreshed.idToken !== cur.idToken) {
      setSession(refreshed);
      AsyncStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(refreshed)).catch(() => undefined);
    }
    return refreshed;
  }, []);

  const syncFromCloud = useCallback(
    async (overrideSession?: AuthSession) => {
      const target = await ensureFreshSession(overrideSession ?? session);
      if (!target || target.isGuest || !target.idToken) return;
      setSyncing(true);
      try {
        const [
          remoteProfile,
          remoteSub,
          remoteProjects,
          remoteChats,
          remoteMessages,
          remoteLibrary,
          remoteMemories,
          remoteEngine,
        ] = await Promise.all([
          Sync.fetchProfile(target),
          fetchSubscription(target).catch(() => null),
          Sync.fetchProjects(target),
          Sync.fetchChats(target),
          Sync.fetchAllMessages(target),
          Sync.fetchLibraryFiles(target),
          Sync.fetchMemories(target),
          Sync.fetchEngineProjects(target),
        ]);

        const effectiveSub =
          remoteSub && remoteSub.isPro
            ? remoteSub
            : remoteProfile?.subscription?.isPro
            ? remoteProfile.subscription
            : remoteSub || remoteProfile?.subscription || DEFAULT_SUBSCRIPTION;

        setSubscription(effectiveSub);
        AsyncStorage.setItem(STORAGE_KEYS.SUBSCRIPTION, JSON.stringify(effectiveSub)).catch(() => undefined);

        if (remoteProfile) {
          setPrefs((prev) => {
            const next: AppPrefs = {
              ...prev,
              theme: remoteProfile.theme || prev.theme,
              accent: (remoteProfile.accent as AccentPresetId) || prev.accent,
              lang: remoteProfile.lang || prev.lang,
            };
            AsyncStorage.setItem(STORAGE_KEYS.PREFS, JSON.stringify(next)).catch(() => undefined);
            return next;
          });
        }

        if (remoteProjects.length > 0) {
          setProjects(remoteProjects);
          AsyncStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(remoteProjects)).catch(() => undefined);
        }
        if (remoteChats.length > 0) {
          setChats(remoteChats);
          AsyncStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(remoteChats)).catch(() => undefined);
        }
        if (Object.keys(remoteMessages).length > 0) {
          setMessagesByChat((prev) => {
            const merged = { ...prev, ...remoteMessages };
            AsyncStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(merged)).catch(() => undefined);
            return merged;
          });
        }
        if (remoteLibrary.length > 0) {
          setLibraryFiles(remoteLibrary);
          AsyncStorage.setItem(STORAGE_KEYS.LIBRARY, JSON.stringify(remoteLibrary)).catch(() => undefined);
        }
        if (remoteMemories.length > 0) {
          setMemories(remoteMemories);
          AsyncStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(remoteMemories)).catch(() => undefined);
        }
        if (remoteEngine.length > 0) {
          setEngineProjects(remoteEngine);
          setActiveEngineId((cur) => cur || remoteEngine[0].id);
          AsyncStorage.setItem(STORAGE_KEYS.ENGINE, JSON.stringify(remoteEngine)).catch(() => undefined);
        }

        setLastSyncedAt(Date.now());
      } catch {
        // Keep local cache on network error
      } finally {
        setSyncing(false);
      }
    },
    [ensureFreshSession, session]
  );

  // Hydrate persisted state on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [sRaw, pRaw, cRaw, mRaw, prRaw, lRaw, memRaw, eRaw, subRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.SESSION),
          AsyncStorage.getItem(STORAGE_KEYS.PREFS),
          AsyncStorage.getItem(STORAGE_KEYS.CHATS),
          AsyncStorage.getItem(STORAGE_KEYS.MESSAGES),
          AsyncStorage.getItem(STORAGE_KEYS.PROJECTS),
          AsyncStorage.getItem(STORAGE_KEYS.LIBRARY),
          AsyncStorage.getItem(STORAGE_KEYS.MEMORIES),
          AsyncStorage.getItem(STORAGE_KEYS.ENGINE),
          AsyncStorage.getItem(STORAGE_KEYS.SUBSCRIPTION),
        ]);
        if (!mounted) return;
        const parsedSession: AuthSession | null = sRaw ? JSON.parse(sRaw) : null;
        if (parsedSession) setSession(parsedSession);
        if (pRaw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(pRaw) });
        if (cRaw) {
          const parsedChats: ChatThread[] = JSON.parse(cRaw);
          setChats(parsedChats);
          if (parsedChats[0]) setActiveChatId(parsedChats[0].id);
        }
        if (mRaw) setMessagesByChat(JSON.parse(mRaw));
        if (prRaw) setProjects(JSON.parse(prRaw));
        if (lRaw) setLibraryFiles(JSON.parse(lRaw));
        if (memRaw) setMemories(JSON.parse(memRaw));
        if (eRaw) {
          const parsedEng: EngineProjectItem[] = JSON.parse(eRaw);
          setEngineProjects(parsedEng);
          if (parsedEng[0]) setActiveEngineId(parsedEng[0].id);
        }
        if (subRaw) setSubscription({ ...DEFAULT_SUBSCRIPTION, ...JSON.parse(subRaw) });
        setReady(true);

        if (parsedSession && !parsedSession.isGuest) {
          syncFromCloud(parsedSession);
        }
      } catch {
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback((key: string, value: any) => {
    AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => undefined);
  }, []);

  // Auth methods
  const completeSignIn = useCallback(
    async (newSession: AuthSession) => {
      setSession(newSession);
      persist(STORAGE_KEYS.SESSION, newSession);
      if (!newSession.isGuest) {
        await syncFromCloud(newSession);
      }
    },
    [persist, syncFromCloud]
  );

  const loginEmail = useCallback(
    async (email: string, password: string) => {
      setAuthBusy(true);
      try {
        const s = await signInWithEmail(email, password, prefs.lang);
        await completeSignIn(s);
        showToast(prefs.lang === "en" ? "Signed in!" : "Вход выполнен!");
      } finally {
        setAuthBusy(false);
      }
    },
    [completeSignIn, prefs.lang, showToast]
  );

  const registerEmail = useCallback(
    async (email: string, password: string, name: string) => {
      setAuthBusy(true);
      try {
        const s = await signUpWithEmail(email, password, name, prefs.lang);
        await completeSignIn(s);
        Sync.saveProfilePrefs(s, prefs.theme, prefs.accent, prefs.lang).catch(() => undefined);
        showToast(prefs.lang === "en" ? "Account created!" : "Аккаунт создан!");
      } finally {
        setAuthBusy(false);
      }
    },
    [completeSignIn, prefs.accent, prefs.lang, prefs.theme, showToast]
  );

  const loginGoogle = useCallback(async () => {
    setAuthBusy(true);
    try {
      const s = await signInWithGoogle(prefs.lang);
      await completeSignIn(s);
      showToast(prefs.lang === "en" ? "Signed in with Google" : "Вход через Google выполнен");
    } finally {
      setAuthBusy(false);
    }
  }, [completeSignIn, prefs.lang, showToast]);

  const continueAsGuest = useCallback(async () => {
    const s = createGuestSession(prefs.lang);
    await completeSignIn(s);
  }, [completeSignIn, prefs.lang]);

  const signOut = useCallback(async () => {
    setSession(null);
    setSubscription(DEFAULT_SUBSCRIPTION);
    setDrawerOpen(false);
    await AsyncStorage.removeItem(STORAGE_KEYS.SESSION);
    await AsyncStorage.removeItem(STORAGE_KEYS.SUBSCRIPTION);
  }, []);

  const updatePrefs = useCallback(
    (patch: Partial<AppPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        persist(STORAGE_KEYS.PREFS, next);
        if (session && !session.isGuest && (patch.theme || patch.accent || patch.lang)) {
          Sync.saveProfilePrefs(session, next.theme, next.accent, next.lang).catch(() => undefined);
        }
        return next;
      });
    },
    [persist, session]
  );

  const redeemKey = useCallback(
    async (key: string) => {
      const fresh = await ensureFreshSession(session);
      const sub = await redeemLicenseKey(fresh, key, prefs.lang);
      setSubscription(sub);
      persist(STORAGE_KEYS.SUBSCRIPTION, sub);
      haptic();
      showToast(
        prefs.lang === "en"
          ? `IGseek Pro activated for ${sub.daysLeft || 30} days!`
          : `IGseek Pro активирован на ${sub.daysLeft || 30} дней!`
      );
    },
    [ensureFreshSession, haptic, persist, prefs.lang, session, showToast]
  );

  // Chat operations
  const createNewChat = useCallback(
    (projectId: string | null = selectedProjectId) => {
      const id = makeId("chat");
      const thread: ChatThread = {
        id,
        title: prefs.lang === "en" ? "New chat" : "Новый чат",
        updatedAtMs: Date.now(),
        isSaved: false,
        projectId,
      };
      setChats((prev) => {
        const next = [thread, ...prev];
        persist(STORAGE_KEYS.CHATS, next);
        return next;
      });
      setActiveChatId(id);
      setActiveTab("chat");
      setDrawerOpen(false);
      Sync.syncChat(session, thread).catch(() => undefined);
      return id;
    },
    [persist, prefs.lang, selectedProjectId, session]
  );

  const selectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setActiveTab("chat");
    setDrawerOpen(false);
  }, []);

  const deleteChat = useCallback(
    (chatId: string) => {
      setChats((prev) => {
        const next = prev.filter((c) => c.id !== chatId);
        persist(STORAGE_KEYS.CHATS, next);
        return next;
      });
      setMessagesByChat((prev) => {
        const next = { ...prev };
        delete next[chatId];
        persist(STORAGE_KEYS.MESSAGES, next);
        return next;
      });
      setActiveChatId((cur) => (cur === chatId ? null : cur));
      Sync.deleteChat(session, chatId).catch(() => undefined);
    },
    [persist, session]
  );

  const toggleSaveChat = useCallback(
    (chatId: string) => {
      haptic();
      setChats((prev) => {
        const next = prev.map((c) => {
          if (c.id !== chatId) return c;
          const updated = { ...c, isSaved: !c.isSaved, updatedAtMs: Date.now() };
          Sync.syncChat(session, updated).catch(() => undefined);
          return updated;
        });
        persist(STORAGE_KEYS.CHATS, next);
        return next;
      });
    },
    [haptic, persist, session]
  );

  const toggleBookmarkMessage = useCallback(
    (chatId: string, msgId: string) => {
      haptic();
      setMessagesByChat((prev) => {
        const list = prev[chatId] || [];
        const next = {
          ...prev,
          [chatId]: list.map((m) =>
            m.id === msgId ? { ...m, isBookmarked: !m.isBookmarked } : m
          ),
        };
        persist(STORAGE_KEYS.MESSAGES, next);
        return next;
      });
    },
    [haptic, persist]
  );

  const createProjectFolder = useCallback(
    (name: string) => {
      const clean = name.trim();
      if (!clean) return;
      const folder: ProjectFolder = {
        id: makeId("proj"),
        name: clean,
        updatedAtMs: Date.now(),
      };
      setProjects((prev) => {
        const next = [folder, ...prev];
        persist(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      Sync.syncProject(session, folder).catch(() => undefined);
    },
    [persist, session]
  );

  const deleteProjectFolder = useCallback(
    (id: string) => {
      setProjects((prev) => {
        const next = prev.filter((p) => p.id !== id);
        persist(STORAGE_KEYS.PROJECTS, next);
        return next;
      });
      if (selectedProjectId === id) setSelectedProjectId(null);
      Sync.deleteProject(session, id).catch(() => undefined);
    },
    [persist, selectedProjectId, session]
  );

  const stopStreaming = useCallback(() => {
    abortStreamRef.current?.();
    abortStreamRef.current = null;
    setStreaming(false);
  }, []);

  const runAssistantStream = useCallback(
    async (
      chatId: string,
      historyForApi: ChatMessageItem[],
      opts: { webSearch: boolean; reasoning: boolean; imageMode: boolean; attachments: ChatAttachment[] }
    ) => {
      const freshSession = await ensureFreshSession(session);
      const assistantId = makeId("msg");
      const assistantMsg: ChatMessageItem = {
        id: assistantId,
        chatId,
        role: "assistant",
        content: "",
        reasoning: "",
        images: [],
        webSources: [],
        createdAtMs: Date.now(),
      };

      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: [...(prev[chatId] || []), assistantMsg],
      }));
      setStreaming(true);

      let finalContent = "";
      let finalReasoning = "";
      let finalImages: ChatMessageItem["images"] = [];
      let finalSources: ChatMessageItem["webSources"] = [];

      try {
        const result = await streamChat({
          session: freshSession,
          history: historyForApi,
          model: prefs.model,
          agent: prefs.agent,
          webSearch: opts.webSearch,
          reasoning: opts.reasoning,
          imageMode: opts.imageMode,
          language: prefs.lang,
          attachments: opts.attachments,
          onAbortRef: (fn) => {
            abortStreamRef.current = fn;
          },
          onDelta: (full) => {
            finalContent = full;
            setMessagesByChat((prev) => ({
              ...prev,
              [chatId]: (prev[chatId] || []).map((m) =>
                m.id === assistantId ? { ...m, content: full } : m
              ),
            }));
          },
          onReasoning: (fullR) => {
            finalReasoning = fullR;
            setMessagesByChat((prev) => ({
              ...prev,
              [chatId]: (prev[chatId] || []).map((m) =>
                m.id === assistantId ? { ...m, reasoning: fullR } : m
              ),
            }));
          },
          onImage: (img) => {
            finalImages = [...(finalImages || []), img];
            setMessagesByChat((prev) => ({
              ...prev,
              [chatId]: (prev[chatId] || []).map((m) =>
                m.id === assistantId ? { ...m, images: [...(m.images || []), img] } : m
              ),
            }));
          },
          onSources: (sources) => {
            finalSources = sources;
            setMessagesByChat((prev) => ({
              ...prev,
              [chatId]: (prev[chatId] || []).map((m) =>
                m.id === assistantId ? { ...m, webSources: sources } : m
              ),
            }));
          },
        });

        finalContent = result.content || finalContent;
        finalReasoning = result.reasoning || finalReasoning;
        finalImages = result.images.length > 0 ? result.images : finalImages;
        finalSources = result.webSources.length > 0 ? result.webSources : finalSources;
      } catch (err: any) {
        finalContent =
          finalContent ||
          `⚠️ ${err?.message || (prefs.lang === "en" ? "Could not get response" : "Не удалось получить ответ")}`;
      } finally {
        setStreaming(false);
        abortStreamRef.current = null;
      }

      const completedMsg: ChatMessageItem = {
        ...assistantMsg,
        content: finalContent || (prefs.lang === "en" ? "Done." : "Готово."),
        reasoning: finalReasoning,
        images: finalImages,
        webSources: finalSources,
      };

      setMessagesByChat((prev) => {
        const updatedList = (prev[chatId] || []).map((m) =>
          m.id === assistantId ? completedMsg : m
        );
        const next = { ...prev, [chatId]: updatedList };
        persist(STORAGE_KEYS.MESSAGES, next);
        Sync.syncMessage(freshSession, completedMsg, updatedList.length - 1).catch(() => undefined);
        return next;
      });
    },
    [ensureFreshSession, persist, prefs.agent, prefs.lang, prefs.model, session]
  );

  const sendMessage = useCallback(
    async (opts: {
      text: string;
      webSearch: boolean;
      reasoning: boolean;
      imageMode: boolean;
      attachments: ChatAttachment[];
    }) => {
      const clean = opts.text.trim();
      if (!clean && opts.attachments.length === 0) return;
      if (streaming) return;

      haptic();
      let chatId = activeChatId;
      let existingThread = chats.find((c) => c.id === chatId);
      if (!chatId || !existingThread) {
        chatId = makeId("chat");
        existingThread = {
          id: chatId,
          title: clean.slice(0, 48) || (prefs.lang === "en" ? "New chat" : "Новый чат"),
          updatedAtMs: Date.now(),
          isSaved: false,
          projectId: selectedProjectId,
        };
        setChats((prev) => {
          const next = [existingThread!, ...prev];
          persist(STORAGE_KEYS.CHATS, next);
          return next;
        });
        setActiveChatId(chatId);
        Sync.syncChat(session, existingThread).catch(() => undefined);
      } else {
        const shouldRetitle =
          existingThread.title === "Новый чат" || existingThread.title === "New chat";
        const updatedThread: ChatThread = {
          ...existingThread,
          title: shouldRetitle && clean ? clean.slice(0, 48) : existingThread.title,
          updatedAtMs: Date.now(),
        };
        setChats((prev) => {
          const next = [updatedThread, ...prev.filter((c) => c.id !== chatId)];
          persist(STORAGE_KEYS.CHATS, next);
          return next;
        });
        Sync.syncChat(session, updatedThread).catch(() => undefined);
      }

      const userMsg: ChatMessageItem = {
        id: makeId("msg"),
        chatId,
        role: "user",
        content: clean || (prefs.lang === "en" ? "Attached files" : "Прикреплённые файлы"),
        attachments: opts.attachments,
        createdAtMs: Date.now(),
      };

      const prevMsgs = messagesByChat[chatId] || [];
      const nextHistory = [...prevMsgs, userMsg];
      setMessagesByChat((prev) => {
        const next = { ...prev, [chatId!]: nextHistory };
        persist(STORAGE_KEYS.MESSAGES, next);
        return next;
      });
      Sync.syncMessage(session, userMsg, nextHistory.length - 1).catch(() => undefined);

      await runAssistantStream(chatId, nextHistory, {
        webSearch: opts.webSearch,
        reasoning: opts.reasoning,
        imageMode: opts.imageMode,
        attachments: opts.attachments,
      });
    },
    [
      activeChatId,
      chats,
      haptic,
      messagesByChat,
      persist,
      prefs.lang,
      runAssistantStream,
      selectedProjectId,
      session,
      streaming,
    ]
  );

  const regenerateLast = useCallback(
    async (opts: { webSearch: boolean; reasoning: boolean }) => {
      if (!activeChatId || streaming) return;
      const list = messagesByChat[activeChatId] || [];
      const lastUserIdx = [...list].map((m) => m.role).lastIndexOf("user");
      if (lastUserIdx < 0) return;
      const trimmed = list.slice(0, lastUserIdx + 1);
      setMessagesByChat((prev) => {
        const next = { ...prev, [activeChatId]: trimmed };
        persist(STORAGE_KEYS.MESSAGES, next);
        return next;
      });
      await runAssistantStream(activeChatId, trimmed, {
        webSearch: opts.webSearch,
        reasoning: opts.reasoning,
        imageMode: false,
        attachments: [],
      });
    },
    [activeChatId, messagesByChat, persist, runAssistantStream, streaming]
  );

  // Flow
  const runFlowGoal = useCallback(
    async (goal: string, autonomy: FlowAutonomy) => {
      const clean = goal.trim();
      if (!clean || flowRunning) return;
      haptic();
      setFlowRunning(true);
      const taskId = makeId("flow");
      const freshSession = await ensureFreshSession(session);

      setFlowTask({
        id: taskId,
        goal: clean,
        title: clean.slice(0, 60),
        autonomy,
        status: "planning",
        steps: [],
        createdAtMs: Date.now(),
      });

      try {
        const plan = await planFlow(freshSession, clean, autonomy, prefs.lang);
        let steps = plan.steps;
        setFlowTask({
          id: taskId,
          goal: clean,
          title: plan.title,
          autonomy,
          status: "running",
          steps,
          createdAtMs: Date.now(),
        });

        const completedOutputs: Array<{ title: string; output: string }> = [];
        for (let i = 0; i < steps.length; i++) {
          steps = steps.map((s, idx) => (idx === i ? { ...s, status: "running" } : s));
          setFlowTask((prev) => (prev ? { ...prev, steps } : prev));
          try {
            const output = await executeFlowStep(
              freshSession,
              clean,
              autonomy,
              steps[i],
              completedOutputs
            );
            completedOutputs.push({ title: steps[i].title, output });
            steps = steps.map((s, idx) =>
              idx === i ? { ...s, status: "done", output } : s
            );
          } catch (err: any) {
            steps = steps.map((s, idx) =>
              idx === i
                ? { ...s, status: "error", output: err?.message || "Ошибка шага" }
                : s
            );
          }
          setFlowTask((prev) => (prev ? { ...prev, steps } : prev));
        }

        setFlowTask((prev) => (prev ? { ...prev, status: "done" } : prev));
      } catch {
        setFlowTask((prev) => (prev ? { ...prev, status: "error" } : prev));
      } finally {
        setFlowRunning(false);
      }
    },
    [ensureFreshSession, flowRunning, haptic, prefs.lang, session]
  );

  const clearFlowTask = useCallback(() => setFlowTask(null), []);

  // Library
  const addLibraryFile = useCallback(
    (item: Omit<LibraryFileItem, "id" | "updatedAt">) => {
      const full: LibraryFileItem = {
        ...item,
        id: makeId("lib"),
        updatedAt: new Date().toISOString(),
      };
      setLibraryFiles((prev) => {
        const next = [full, ...prev];
        persist(STORAGE_KEYS.LIBRARY, next);
        return next;
      });
      Sync.syncLibraryFile(session, full).catch(() => undefined);
      showToast(prefs.lang === "en" ? "Saved to Library" : "Сохранено в библиотеку");
    },
    [persist, prefs.lang, session, showToast]
  );

  const removeLibraryFile = useCallback(
    (id: string) => {
      setLibraryFiles((prev) => {
        const next = prev.filter((f) => f.id !== id);
        persist(STORAGE_KEYS.LIBRARY, next);
        return next;
      });
      Sync.deleteLibraryFile(session, id).catch(() => undefined);
    },
    [persist, session]
  );

  // Memories
  const addMemory = useCallback(
    (content: string, kind: MemoryEntryItem["kind"]) => {
      const clean = content.trim();
      if (!clean) return;
      const entry: MemoryEntryItem = {
        id: makeId("mem"),
        content: clean,
        kind,
        createdAt: new Date().toISOString(),
      };
      setMemories((prev) => {
        const next = [entry, ...prev];
        persist(STORAGE_KEYS.MEMORIES, next);
        return next;
      });
      Sync.syncMemory(session, entry).catch(() => undefined);
      showToast(prefs.lang === "en" ? "Memory saved" : "Факт сохранён в память");
    },
    [persist, prefs.lang, session, showToast]
  );

  const removeMemory = useCallback(
    (id: string) => {
      setMemories((prev) => {
        const next = prev.filter((m) => m.id !== id);
        persist(STORAGE_KEYS.MEMORIES, next);
        return next;
      });
      Sync.deleteMemory(session, id).catch(() => undefined);
    },
    [persist, session]
  );

  // Engine
  const buildEngineApp = useCallback(
    async (prompt: string, refineActive = false) => {
      const clean = prompt.trim();
      if (!clean || engineBusy) return;
      haptic();
      setEngineBusy(true);
      try {
        const fresh = await ensureFreshSession(session);
        const existing = refineActive
          ? engineProjects.find((p) => p.id === activeEngineId) || null
          : null;
        const proj = await generateEngineProject(fresh, clean, prefs.lang, existing);
        setEngineProjects((prev) => {
          const next = [proj, ...prev.filter((p) => p.id !== proj.id)];
          persist(STORAGE_KEYS.ENGINE, next);
          return next;
        });
        setActiveEngineId(proj.id);
        Sync.syncEngineProject(fresh, proj).catch(() => undefined);
        showToast(prefs.lang === "en" ? "Project generated!" : "Проект создан!");
      } catch (err: any) {
        showToast(err?.message || "Ошибка генерации");
      } finally {
        setEngineBusy(false);
      }
    },
    [
      activeEngineId,
      engineBusy,
      engineProjects,
      ensureFreshSession,
      haptic,
      persist,
      prefs.lang,
      session,
      showToast,
    ]
  );

  const removeEngineProject = useCallback(
    (id: string) => {
      setEngineProjects((prev) => {
        const next = prev.filter((p) => p.id !== id);
        persist(STORAGE_KEYS.ENGINE, next);
        return next;
      });
      if (activeEngineId === id) setActiveEngineId(null);
      Sync.deleteEngineProject(session, id).catch(() => undefined);
    },
    [activeEngineId, persist, session]
  );

  const activeMessages = useMemo(
    () => (activeChatId ? messagesByChat[activeChatId] || [] : []),
    [activeChatId, messagesByChat]
  );

  const value: AppContextValue = {
    ready,
    session,
    prefs,
    colors,
    activeTab,
    setActiveTab,
    drawerOpen,
    setDrawerOpen,
    proModalOpen,
    setProModalOpen,
    toast,
    showToast,
    haptic,
    authBusy,
    loginEmail,
    registerEmail,
    loginGoogle,
    continueAsGuest,
    signOut,
    syncing,
    lastSyncedAt,
    syncFromCloud,
    subscription,
    redeemKey,
    updatePrefs,
    chats,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    activeChatId,
    activeMessages,
    messagesByChat,
    streaming,
    draftPrompt,
    setDraftPrompt,
    createNewChat,
    selectChat,
    deleteChat,
    toggleSaveChat,
    toggleBookmarkMessage,
    createProjectFolder,
    deleteProjectFolder,
    sendMessage,
    stopStreaming,
    regenerateLast,
    flowTask,
    flowRunning,
    runFlowGoal,
    clearFlowTask,
    libraryFiles,
    addLibraryFile,
    removeLibraryFile,
    memories,
    addMemory,
    removeMemory,
    engineProjects,
    activeEngineId,
    setActiveEngineId,
    engineBusy,
    buildEngineApp,
    removeEngineProject,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
