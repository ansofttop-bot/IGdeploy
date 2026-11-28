import React, { useState } from "react";
import { Download, Share, PlusSquare, Smartphone, X, WifiOff } from "lucide-react";
import { useOnlineStatus, usePWAInstall } from "@/hooks/usePWAInstall";
import { useLang } from "@/lib/i18n";

const DISMISS_KEY = "igseek:pwa_banner_dismissed_v1";

interface PWAInstallButtonProps {
  variant?: "inline" | "floating";
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = "inline" }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [lang] = useLang();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const ru = lang === "ru";

  // Hide when already running as a standalone installed app or inside Android WebView
  if (isInstalled) return null;
  if (typeof window !== "undefined" && (window as any).IGseekNativeBridge) return null;
  if (!isInstallable && !isIOS) return null;
  if (variant === "floating" && dismissed) return null;

  const handleAction = () => {
    if (isInstallable) {
      install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const iosModal = showIOSGuide ? (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={() => setShowIOSGuide(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/15 text-brand">
              <Smartphone size={18} />
            </span>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {ru ? "Установить IGseek на iPhone" : "Install IGseek on iPhone"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {ru ? "Работает как нативное приложение без App Store" : "Runs fullscreen like a native app"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowIOSGuide(false)}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <ol className="mt-4 space-y-3 text-sm text-foreground">
          <li className="flex items-start gap-3 rounded-xl border border-border bg-surface/70 p-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
              1
            </span>
            <span className="leading-snug">
              {ru ? (
                <>
                  Нажмите кнопку <strong className="inline-flex items-center gap-1">Поделиться <Share size={13} className="inline" /></strong> внизу экрана Safari.
                </>
              ) : (
                <>
                  Tap the <strong className="inline-flex items-center gap-1">Share <Share size={13} className="inline" /></strong> button in Safari&apos;s toolbar.
                </>
              )}
            </span>
          </li>
          <li className="flex items-start gap-3 rounded-xl border border-border bg-surface/70 p-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
              2
            </span>
            <span className="leading-snug">
              {ru ? (
                <>
                  Выберите <strong className="inline-flex items-center gap-1">На экран «Домой» <PlusSquare size={13} className="inline" /></strong> и нажмите <strong>Добавить</strong>.
                </>
              ) : (
                <>
                  Tap <strong className="inline-flex items-center gap-1">Add to Home Screen <PlusSquare size={13} className="inline" /></strong> and confirm <strong>Add</strong>.
                </>
              )}
            </span>
          </li>
        </ol>

        <button
          type="button"
          onClick={() => setShowIOSGuide(false)}
          className="mt-4 w-full rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
        >
          {ru ? "Понятно" : "Got it"}
        </button>
      </div>
    </div>
  ) : null;

  if (variant === "floating") {
    return (
      <>
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-border bg-card/95 py-1.5 pl-3 pr-1.5 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={handleAction}
            className="flex items-center gap-2 text-xs font-semibold text-foreground hover:opacity-85 cursor-pointer"
          >
            <Download size={14} className="text-brand" />
            <span>
              {isIOS
                ? ru
                  ? "Установить на iPhone"
                  : "Install on iOS"
                : ru
                ? "Установить приложение"
                : "Install App"}
            </span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground cursor-pointer"
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
        {iosModal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleAction}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/90 px-4 py-3 text-sm font-semibold text-foreground shadow-xs transition hover:bg-surface-elevated cursor-pointer"
      >
        <Download size={15} />
        <span>
          {isIOS
            ? ru
              ? "Установить на iPhone"
              : "Install on iOS"
            : ru
            ? "Установить приложение"
            : "Install App"}
        </span>
      </button>
      {iosModal}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [lang] = useLang();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
      <WifiOff size={13} />
      <span>{lang === "ru" ? "Офлайн-режим" : "Offline Mode"}</span>
    </div>
  );
};
