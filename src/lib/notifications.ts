import { toast } from "sonner";
import { getWorkspaceAccessToken } from "./google-workspace-auth";
import { listCalendarEvents } from "./google-calendar";
import { listGoogleTasks } from "./google-tasks";
import { listGmailMessages } from "./gmail";

export type PushNotificationSource = "tasks" | "calendar" | "gmail" | "general";

export interface PushNotificationPayload {
  id: string;
  title: string;
  body: string;
  source: PushNotificationSource;
  delaySeconds?: number;
  scheduledAt?: string;
  createdAt?: string;
  delivered?: boolean;
}

const ENABLED_KEY = "igseek:push_notifications_enabled";
const SCHEDULED_KEY = "igseek:scheduled_notifications_v1";
const SEEN_WORKSPACE_KEY = "igseek:seen_workspace_notifs_v1";

const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function isPushNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isPushNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export function isPushNotificationsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(ENABLED_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export function setPushNotificationsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
    window.dispatchEvent(new CustomEvent("igseek:notifications-pref-changed", { detail: { enabled } }));
  } catch {
  }
}

export async function requestPushNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isPushNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") {
    setPushNotificationsEnabled(true);
    return "granted";
  }
  try {
    const result = await Notification.requestPermission();
    if (result === "granted") {
      setPushNotificationsEnabled(true);
    }
    window.dispatchEvent(new CustomEvent("igseek:notifications-pref-changed", { detail: { permission: result } }));
    return result;
  } catch {
    return Notification.permission;
  }
}

function sourceTagLabel(source: PushNotificationSource): string {
  switch (source) {
    case "calendar":
      return "Google Calendar";
    case "tasks":
      return "Google Tasks";
    case "gmail":
      return "Gmail";
    default:
      return "IGseek AI";
  }
}

async function deliverBrowserPush(payload: PushNotificationPayload): Promise<boolean> {
  const tag = `igseek-${payload.source}-${payload.id}`;
  const title = payload.title || sourceTagLabel(payload.source);
  const body = payload.body || "";

  // Always show a clean in-app toast when the tab is visible
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    toast(title, {
      description: body,
      duration: 6000,
    });
  }

  if (!isPushNotificationsEnabled() || !isPushNotificationSupported()) {
    return false;
  }
  if (Notification.permission !== "granted") {
    return false;
  }

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, {
          body,
          icon: "/apple-touch-icon.png",
          badge: "/favicon.ico",
          tag,
          data: { source: payload.source, id: payload.id },
        });
        return true;
      }
    }
  } catch {
    // fallback to window Notification API
  }

  try {
    new Notification(title, {
      body,
      icon: "/apple-touch-icon.png",
      tag,
    });
    return true;
  } catch {
    return false;
  }
}

interface StoredScheduledNotification {
  payload: PushNotificationPayload;
  fireAtMs: number;
}

function readScheduledQueue(): StoredScheduledNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SCHEDULED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeScheduledQueue(items: StoredScheduledNotification[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCHEDULED_KEY, JSON.stringify(items.slice(-50)));
  } catch {
  }
}

function removeScheduledById(id: string): void {
  const next = readScheduledQueue().filter((item) => item.payload.id !== id);
  writeScheduledQueue(next);
}

export async function triggerOrSchedulePushNotification(
  payload: PushNotificationPayload,
): Promise<{ delivered: boolean; scheduledForMs: number | null }> {
  const now = Date.now();
  let fireAtMs = now;

  if (typeof payload.delaySeconds === "number" && Number.isFinite(payload.delaySeconds) && payload.delaySeconds > 0) {
    fireAtMs = now + Math.round(payload.delaySeconds * 1000);
  } else if (payload.scheduledAt) {
    const parsed = Date.parse(payload.scheduledAt);
    if (!Number.isNaN(parsed) && parsed > now + 1500) {
      fireAtMs = parsed;
    }
  }

  const delayMs = fireAtMs - now;
  if (delayMs <= 1500) {
    const delivered = await deliverBrowserPush(payload);
    return { delivered, scheduledForMs: null };
  }

  // Persist scheduled notification so it survives tab reloads
  const existing = readScheduledQueue().filter((item) => item.payload.id !== payload.id);
  existing.push({ payload, fireAtMs });
  writeScheduledQueue(existing);

  // Schedule in-memory timer (capped to safe setTimeout range ~24 days)
  if (delayMs < 2_100_000_000) {
    const prevTimer = activeTimers.get(payload.id);
    if (prevTimer) clearTimeout(prevTimer);
    const timer = setTimeout(() => {
      activeTimers.delete(payload.id);
      removeScheduledById(payload.id);
      void deliverBrowserPush(payload);
    }, delayMs);
    activeTimers.set(payload.id, timer);
  }

  return { delivered: false, scheduledForMs: fireAtMs };
}

export function restoreScheduledPushNotifications(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const queue = readScheduledQueue();
  const remaining: StoredScheduledNotification[] = [];

  for (const item of queue) {
    const delayMs = item.fireAtMs - now;
    if (delayMs <= 1000) {
      // Fire missed notifications that are less than 12 hours old
      if (now - item.fireAtMs < 12 * 3600_000) {
        void deliverBrowserPush(item.payload);
      }
      continue;
    }
    remaining.push(item);
    if (delayMs < 2_100_000_000 && !activeTimers.has(item.payload.id)) {
      const timer = setTimeout(() => {
        activeTimers.delete(item.payload.id);
        removeScheduledById(item.payload.id);
        void deliverBrowserPush(item.payload);
      }, delayMs);
      activeTimers.set(item.payload.id, timer);
    }
  }
  writeScheduledQueue(remaining);
}

function getSeenWorkspaceIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_WORKSPACE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function markWorkspaceIdSeen(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const seen = getSeenWorkspaceIds();
    seen.add(id);
    const arr = Array.from(seen).slice(-300);
    window.localStorage.setItem(SEEN_WORKSPACE_KEY, JSON.stringify(arr));
  } catch {
  }
}

/**
 * Checks connected Google Calendar, Google Tasks, and Gmail for timely alerts
 * (upcoming events within 15 min, due tasks today, and newly arrived unread emails)
 * and sends real browser push notifications when enabled.
 */
export async function pollWorkspacePushAlerts(initialSeedOnly = false): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isPushNotificationsEnabled()) return;
  if (!getWorkspaceAccessToken()) return;

  const seen = getSeenWorkspaceIds();
  const now = Date.now();

  // 1. Google Calendar: events starting within the next 15 minutes
  try {
    const events = await listCalendarEvents({
      timeMin: new Date(now).toISOString(),
      timeMax: new Date(now + 16 * 60_000).toISOString(),
      maxResults: 10,
    });
    for (const ev of events) {
      const key = `cal:${ev.id}:${ev.start?.dateTime || ev.start?.date || ""}`;
      if (seen.has(key)) continue;
      markWorkspaceIdSeen(key);
      if (initialSeedOnly) continue;
      const startMs = ev.start?.dateTime ? Date.parse(ev.start.dateTime) : NaN;
      const minsLeft = Number.isNaN(startMs) ? null : Math.max(1, Math.round((startMs - now) / 60_000));
      await deliverBrowserPush({
        id: key,
        title: ev.summary || "Upcoming Calendar Event",
        body: minsLeft !== null ? `Starts in ${minsLeft} min${ev.location ? ` · ${ev.location}` : ""}` : "Starting soon",
        source: "calendar",
      });
    }
  } catch {
    // ignore transient auth/network errors during background poll
  }

  // 2. Google Tasks: open tasks due today
  try {
    const tasks = await listGoogleTasks("@default", false);
    const todayIso = new Date(now).toISOString().slice(0, 10);
    for (const task of tasks) {
      if (task.status === "completed" || !task.due) continue;
      if (task.due.slice(0, 10) !== todayIso) continue;
      const key = `task:${task.id}:${todayIso}`;
      if (seen.has(key)) continue;
      markWorkspaceIdSeen(key);
      if (initialSeedOnly) continue;
      await deliverBrowserPush({
        id: key,
        title: `Task due today: ${task.title}`,
        body: task.notes?.slice(0, 140) || "Open Google Tasks in IGseek to complete it.",
        source: "tasks",
      });
    }
  } catch {
    // ignore
  }

  // 3. Gmail: newly arrived unread emails
  try {
    const unread = await listGmailMessages({ q: "in:inbox is:unread", maxResults: 5 });
    for (const msg of unread) {
      const key = `gmail:${msg.id}`;
      if (seen.has(key)) continue;
      markWorkspaceIdSeen(key);
      if (initialSeedOnly) continue;
      await deliverBrowserPush({
        id: key,
        title: msg.subject || "New email in Gmail",
        body: `${msg.from ? `${msg.from}: ` : ""}${msg.snippet || ""}`.slice(0, 180),
        source: "gmail",
      });
    }
  } catch {
    // ignore
  }
}

export function startPushNotificationEngine(): () => void {
  if (typeof window === "undefined") return () => {};

  restoreScheduledPushNotifications();
  let seeded = false;

  const runPoll = () => {
    if (!getWorkspaceAccessToken()) return;
    if (!seeded) {
      seeded = true;
      void pollWorkspacePushAlerts(true);
      return;
    }
    void pollWorkspacePushAlerts(false);
  };

  const intervalId = window.setInterval(runPoll, 3 * 60_000);
  const onWorkspaceAuth = () => {
    seeded = false;
    runPoll();
  };
  window.addEventListener("igseek:workspace-auth-changed", onWorkspaceAuth);
  runPoll();

  return () => {
    window.clearInterval(intervalId);
    window.removeEventListener("igseek:workspace-auth-changed", onWorkspaceAuth);
  };
}
