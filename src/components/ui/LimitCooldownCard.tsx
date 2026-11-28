import { useEffect, useState } from "react";
import { Clock, Crown, ShieldAlert } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import {
  PROMPT_LIMITS,
  type PromptScope,
  formatRemainingReset,
} from "@/lib/prompt-limits";

export interface LimitCooldownPayload {
  scope: PromptScope;
  used?: number;
  limit?: number;
  resetAt: number;
}

export function LimitCooldownCard({
  scope,
  used,
  limit,
  resetAt,
  compact = false,
}: {
  scope: PromptScope;
  used?: number;
  limit?: number;
  resetAt: number;
  compact?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const isRu = lang === "ru";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [resetAt]);

  const maxLimit = limit ?? PROMPT_LIMITS[scope];
  const currentUsed = used ?? maxLimit;
  const remainingText = formatRemainingReset(resetAt, lang, now);
  const isReady = resetAt > 0 && now >= resetAt;

  const openProUpgrade = () => {
    window.dispatchEvent(new CustomEvent("igseek:open-subscription"));
  };

  const scopeLabel =
    scope === "engine"
      ? t("Engine")
      : scope === "flow"
        ? t("Flow")
        : scope === "image"
          ? t("Photos")
          : t("Chat");

  const exhaustedLabel =
    scope === "image"
      ? isRu
        ? "Дневной лимит фото исчерпан"
        : "Daily photo limit reached"
      : isRu
        ? `Лимит ${scopeLabel} исчерпан`
        : `${scopeLabel} limit reached`;

  const exhaustedDescription =
    scope === "image"
      ? isRu
        ? `На Free доступно ${maxLimit} генерации фото за 24 часа (чат остаётся безлимитным). Подключите IGseek Pro для безлимитных фото и редактирования по референсу.`
        : `Free includes ${maxLimit} photo generations per 24h while Chat stays unlimited. Upgrade to IGseek Pro for unlimited studio images and reference editing.`
      : isRu
        ? `На Free доступно ${maxLimit} запуска ${scopeLabel} за 12 часов (чат всегда безлимитный). Подключите IGseek Pro, чтобы снять все ограничения.`
        : `Free includes ${maxLimit} ${scopeLabel} runs per 12h while Chat stays unlimited. Upgrade to IGseek Pro to unlock unlimited runs.`;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Clock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="font-medium leading-snug">
            {isReady
              ? t("Limits have been refreshed. You can send again.")
              : `${exhaustedLabel} (${currentUsed}/${maxLimit}). ${t("Limits will reset in")} ${remainingText}.`}
          </span>
        </div>
        <button
          type="button"
          onClick={openProUpgrade}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--brand)] px-2.5 py-1 text-[11px] font-semibold text-white hover:brightness-110 transition-all cursor-pointer"
        >
          <Crown className="h-3 w-3" />
          <span>{isRu ? "Открыть Pro" : "Unlock Pro"}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] dark:bg-amber-500/[0.09] p-4 text-left shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <ShieldAlert className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {scopeLabel} — {exhaustedLabel}
            </span>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-300">
              {currentUsed}/{maxLimit}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
            {isReady
              ? t("Limits have been refreshed. You can send again.")
              : exhaustedDescription}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {!isReady && (
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-white/70 dark:bg-black/25 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {t("Limits will reset in")} <span className="font-mono">{remainingText}</span>
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={openProUpgrade}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 transition-all cursor-pointer shadow-sm"
            >
              <Crown className="h-3.5 w-3.5" />
              <span>{isRu ? "Перейти на IGseek Pro" : "Upgrade to IGseek Pro"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
