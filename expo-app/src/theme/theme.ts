import { AccentPresetId } from "../types/models";

export interface AccentSwatch {
  id: AccentPresetId;
  labelRu: string;
  labelEn: string;
  brand: string;
  glow: string;
  soft: string;
  border: string;
  activeBg: string;
  bubbleBg: string;
}

export const ACCENT_PRESETS: Record<AccentPresetId, AccentSwatch> = {
  red: {
    id: "red",
    labelRu: "Красный",
    labelEn: "Crimson",
    brand: "#EF4444",
    glow: "#F87171",
    soft: "rgba(239, 68, 68, 0.16)",
    border: "rgba(239, 68, 68, 0.36)",
    activeBg: "#381016",
    bubbleBg: "#3A131A",
  },
  orange: {
    id: "orange",
    labelRu: "Оранжевый",
    labelEn: "Tangerine",
    brand: "#F97316",
    glow: "#FB923C",
    soft: "rgba(249, 115, 22, 0.16)",
    border: "rgba(249, 115, 22, 0.36)",
    activeBg: "#3B1B0B",
    bubbleBg: "#3D1D0D",
  },
  black: {
    id: "black",
    labelRu: "Монохром",
    labelEn: "Monochrome",
    brand: "#E4E4E7",
    glow: "#FFFFFF",
    soft: "rgba(228, 228, 231, 0.13)",
    border: "rgba(228, 228, 231, 0.28)",
    activeBg: "#27272A",
    bubbleBg: "#27272A",
  },
  emerald: {
    id: "emerald",
    labelRu: "Изумруд",
    labelEn: "Emerald",
    brand: "#10B981",
    glow: "#34D399",
    soft: "rgba(16, 185, 129, 0.16)",
    border: "rgba(16, 185, 129, 0.35)",
    activeBg: "#0A2E22",
    bubbleBg: "#0D3326",
  },
  blue: {
    id: "blue",
    labelRu: "Кобальт",
    labelEn: "Cobalt",
    brand: "#3B82F6",
    glow: "#60A5FA",
    soft: "rgba(59, 130, 246, 0.16)",
    border: "rgba(59, 130, 246, 0.35)",
    activeBg: "#102546",
    bubbleBg: "#13294B",
  },
  purple: {
    id: "purple",
    labelRu: "Фиолетовый",
    labelEn: "Violet",
    brand: "#8B5CF6",
    glow: "#A78BFA",
    soft: "rgba(139, 92, 246, 0.16)",
    border: "rgba(139, 92, 246, 0.35)",
    activeBg: "#241345",
    bubbleBg: "#27154B",
  },
  pink: {
    id: "pink",
    labelRu: "Розовый",
    labelEn: "Rose",
    brand: "#EC4899",
    glow: "#F472B6",
    soft: "rgba(236, 72, 153, 0.16)",
    border: "rgba(236, 72, 153, 0.35)",
    activeBg: "#3D1027",
    bubbleBg: "#42122B",
  },
  amber: {
    id: "amber",
    labelRu: "Янтарь",
    labelEn: "Amber",
    brand: "#F59E0B",
    glow: "#FBBF24",
    soft: "rgba(245, 158, 11, 0.16)",
    border: "rgba(245, 158, 11, 0.35)",
    activeBg: "#382406",
    bubbleBg: "#3D2708",
  },
};

export interface AppColors {
  isDark: boolean;
  bg: string;
  surface: string;
  surfaceElevated: string;
  card: string;
  sidebarBg: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  border: string;
  borderStrong: string;
  inputBg: string;
  brand: string;
  brandGlow: string;
  brandSoft: string;
  brandBorder: string;
  brandActiveBg: string;
  userBubbleBg: string;
  userBubbleText: string;
  onBrand: string;
  danger: string;
  success: string;
  warning: string;
  codeBg: string;
  codeHeaderBg: string;
  overlay: string;
}

export function getThemeColors(
  mode: "dark" | "light",
  accent: AccentPresetId
): AppColors {
  const isDark = mode === "dark";
  const preset = ACCENT_PRESETS[accent] || ACCENT_PRESETS.red;

  if (!isDark) {
    // Exact IGseek Web Light Theme (monochrome zinc-900 brand + warm off-white surface)
    return {
      isDark: false,
      bg: "#FCFBFA",
      surface: "#F4F3F2",
      surfaceElevated: "#ECEBE9",
      card: "#FFFFFF",
      sidebarBg: "#F7F6F5",
      text: "#141414",
      textMuted: "#666463",
      textSubtle: "#9A9795",
      border: "rgba(20, 20, 20, 0.10)",
      borderStrong: "rgba(20, 20, 20, 0.18)",
      inputBg: "#F2F1EF",
      brand: "#18181B",
      brandGlow: "#27272A",
      brandSoft: "rgba(24, 24, 27, 0.08)",
      brandBorder: "rgba(24, 24, 27, 0.20)",
      brandActiveBg: "#18181B",
      userBubbleBg: "#18181B",
      userBubbleText: "#FAFAFA",
      onBrand: "#FFFFFF",
      danger: "#DC2626",
      success: "#16A34A",
      warning: "#D97706",
      codeBg: "#141416",
      codeHeaderBg: "#1E1E22",
      overlay: "rgba(0, 0, 0, 0.42)",
    };
  }

  // Exact IGseek Web Dark Theme (obsidian #0B0A0A + customizable accent)
  const onBrand = preset.id === "black" ? "#0B0A0A" : "#FFFFFF";
  return {
    isDark: true,
    bg: "#0B0A0A",
    surface: "#121112",
    surfaceElevated: "#1A191B",
    card: "#141315",
    sidebarBg: "#0F0E0F",
    text: "#F5F4F4",
    textMuted: "#979392",
    textSubtle: "#636060",
    border: "rgba(255, 255, 255, 0.085)",
    borderStrong: "rgba(255, 255, 255, 0.16)",
    inputBg: "#171618",
    brand: preset.brand,
    brandGlow: preset.glow,
    brandSoft: preset.soft,
    brandBorder: preset.border,
    brandActiveBg: preset.activeBg,
    userBubbleBg: "#1F1E20",
    userBubbleText: "#F5F4F4",
    onBrand,
    danger: "#EF4444",
    success: "#22C55E",
    warning: "#F59E0B",
    codeBg: "#0E0D0F",
    codeHeaderBg: "#18171A",
    overlay: "rgba(0, 0, 0, 0.68)",
  };
}
