export type IGseekTab =
  | "chat"
  | "flow"
  | "library"
  | "saved"
  | "engine"
  | "wave"
  | "docs"
  | "memory"
  | "settings";

export type AccentPresetId =
  | "red"
  | "orange"
  | "black"
  | "emerald"
  | "blue"
  | "purple"
  | "pink"
  | "amber";

export type AiModelId = "instinct" | "chat" | "flash";

export type AgentRoleId =
  | "universal"
  | "coder"
  | "hacker"
  | "mentor"
  | "psychologist"
  | "creative";

export type FlowAutonomy = "assist" | "semi-auto" | "autopilot";

export interface AuthSession {
  uid: string;
  email: string;
  displayName: string;
  idToken: string;
  refreshToken: string;
  provider: "google" | "password" | "guest";
  isGuest: boolean;
  expiresAtMs: number;
}

export interface SubscriptionInfo {
  plan: "free" | "pro";
  isPro: boolean;
  status: string;
  daysLeft: number;
  expiresAt: string | null;
  lastKeyId: string | null;
  durationDays: number;
}

export interface ProjectFolder {
  id: string;
  name: string;
  updatedAtMs: number;
}

export interface ChatThread {
  id: string;
  title: string;
  updatedAtMs: number;
  isSaved: boolean;
  projectId: string | null;
}

export interface GeneratedImageItem {
  id: string;
  title: string;
  dataUrl: string;
}

export interface WebSourceItem {
  title: string;
  url: string;
  snippet: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes?: number;
}

export interface ChatMessageItem {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  images?: GeneratedImageItem[];
  webSources?: WebSourceItem[];
  attachments?: ChatAttachment[];
  createdAtMs: number;
  isBookmarked?: boolean;
}

export interface FlowStepItem {
  id: string;
  title: string;
  description: string;
  tool: string;
  requiresApproval?: boolean;
  status: "pending" | "running" | "done" | "error";
  output?: string;
}

export interface FlowTaskState {
  id: string;
  goal: string;
  title: string;
  autonomy: FlowAutonomy;
  status: "idle" | "planning" | "running" | "done" | "error";
  steps: FlowStepItem[];
  createdAtMs: number;
}

export interface EngineFileItem {
  path: string;
  content: string;
}

export interface EngineProjectItem {
  id: string;
  title: string;
  prompt?: string;
  activeFile: string;
  files: EngineFileItem[];
  updatedAtMs: number;
}

export interface LibraryFileItem {
  id: string;
  name: string;
  type: "image" | "code" | "doc" | "data";
  mimeType: string;
  sizeBytes: number;
  source: string;
  chatTitle: string;
  updatedAt: string;
  content?: string | null;
  dataUrl?: string | null;
}

export interface MemoryEntryItem {
  id: string;
  content: string;
  kind: "preference" | "fact" | "goal" | "work" | "other";
  createdAt: string;
}

export interface AppPrefs {
  theme: "dark" | "light";
  accent: AccentPresetId;
  lang: "ru" | "en";
  model: AiModelId;
  agent: AgentRoleId;
  hapticsEnabled: boolean;
}

export const AI_MODELS: {
  id: AiModelId;
  name: string;
  subtitleRu: string;
  subtitleEn: string;
  badge: string;
}[] = [
  {
    id: "instinct",
    name: "IGseek Instinct",
    subtitleRu: "Флагманская модель · глубина и код",
    subtitleEn: "Flagship model · deep reasoning & code",
    badge: "Flagship",
  },
  {
    id: "chat",
    name: "IGseek Chat",
    subtitleRu: "Сбалансированный диалог на каждый день",
    subtitleEn: "Balanced everyday conversation",
    badge: "Balanced",
  },
  {
    id: "flash",
    name: "IGseek Flash",
    subtitleRu: "Мгновенные ответы с низкой задержкой",
    subtitleEn: "Ultra-fast low-latency responses",
    badge: "Fast",
  },
];

export const AGENT_ROLES: {
  id: AgentRoleId;
  labelRu: string;
  labelEn: string;
  descRu: string;
  descEn: string;
}[] = [
  {
    id: "universal",
    labelRu: "Универсальный",
    labelEn: "Universal",
    descRu: "Любые задачи, анализ, тексты и планы",
    descEn: "All tasks, research, writing & planning",
  },
  {
    id: "coder",
    labelRu: "Кодер",
    labelEn: "Coder",
    descRu: "Архитектура, дебаг и чистый код",
    descEn: "Architecture, debugging & clean code",
  },
  {
    id: "hacker",
    labelRu: "Киберэксперт",
    labelEn: "Security",
    descRu: "Аудит безопасности, сети и Linux",
    descEn: "Security audits, networking & Linux",
  },
  {
    id: "mentor",
    labelRu: "Ментор",
    labelEn: "Mentor",
    descRu: "Пошаговое объяснение сложных тем",
    descEn: "Step-by-step teaching & clarity",
  },
  {
    id: "psychologist",
    labelRu: "Психолог",
    labelEn: "Psy",
    descRu: "Бережная поддержка и рефлексия",
    descEn: "Thoughtful support & reflection",
  },
  {
    id: "creative",
    labelRu: "Креатив",
    labelEn: "Creative",
    descRu: "Идеи, сторителлинг, промпты и дизайн",
    descEn: "Ideas, storytelling, prompts & design",
  },
];
