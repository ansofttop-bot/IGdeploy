import {
  Check,
  Cloud,
  Crown,
  Globe,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Settings,
  Smartphone,
  Sun,
} from "lucide-react-native";
import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { IGSEEK_CONFIG } from "../config";
import { useApp } from "../state/AppContext";
import { ACCENT_PRESETS } from "../theme/theme";
import { AccentPresetId } from "../types/models";

const ACCENT_LIST: AccentPresetId[] = [
  "red",
  "orange",
  "black",
  "emerald",
  "blue",
  "purple",
  "pink",
  "amber",
];

export const SettingsScreen: React.FC = () => {
  const {
    colors,
    prefs,
    updatePrefs,
    setDrawerOpen,
    session,
    signOut,
    syncing,
    lastSyncedAt,
    syncFromCloud,
    subscription,
    setProModalOpen,
    showToast,
  } = useApp();

  const en = prefs.lang === "en";

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.iconBtn}>
          <Menu size={21} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Settings size={18} color={colors.brand} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {en ? "Settings" : "Настройки"}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Account & Cloud Sync */}
        <Text style={[styles.secLabel, { color: colors.textSubtle }]}>
          {en ? "ACCOUNT & CLOUD SYNC" : "АККАУНТ И ОБЛАКО"}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
              <View style={[styles.avatar, { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder }]}>
                <Text style={{ color: colors.brand, fontSize: 16, fontWeight: "800" }}>
                  {(session?.displayName || "U").slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                  {session?.displayName || (en ? "Guest" : "Гость")}
                </Text>
                <Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
                  {session?.isGuest
                    ? en
                      ? "Guest · sign in for cross-device sync"
                      : "Гость · войдите для облачной синхронизации"
                    : session?.email}
                </Text>
              </View>
            </View>
          </View>

          {!session?.isGuest ? (
            <View style={[styles.syncRow, { borderTopColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Cloud size={16} color={colors.success} />
                <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                  {lastSyncedAt
                    ? en
                      ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
                      : `Синхронизировано в ${new Date(lastSyncedAt).toLocaleTimeString()}`
                    : en
                    ? "Connected to Firestore cloud"
                    : "Подключено к облаку IGseek"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  await syncFromCloud();
                  showToast(en ? "Cloud synced!" : "Синхронизация завершена!");
                }}
                disabled={syncing}
                style={[styles.smallBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <RefreshCw size={14} color={colors.text} />
                )}
                <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "700" }}>
                  {en ? "Sync" : "Обновить"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={signOut}
            style={[styles.signOutBtn, { borderColor: colors.border }]}
          >
            <LogOut size={15} color={colors.danger} />
            <Text style={{ color: colors.danger, fontSize: 13.5, fontWeight: "700" }}>
              {session?.isGuest
                ? en
                  ? "Sign in / Create account"
                  : "Войти или зарегистрироваться"
                : en
                ? "Sign out"
                : "Выйти из аккаунта"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* IGseek Pro */}
        <Text style={[styles.secLabel, { color: colors.textSubtle }]}>
          {en ? "SUBSCRIPTION" : "ПОДПИСКА"}
        </Text>
        <TouchableOpacity
          onPress={() => setProModalOpen(true)}
          style={[
            styles.card,
            {
              backgroundColor: subscription.isPro ? colors.brandSoft : colors.card,
              borderColor: subscription.isPro ? colors.brandBorder : colors.border,
            },
          ]}
          activeOpacity={0.8}
        >
          <View style={styles.rowBetween}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Crown size={20} color={colors.brand} />
              <View>
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  {subscription.isPro ? "IGseek Pro" : "IGseek Free"}
                </Text>
                <Text style={[styles.cardSub, { color: colors.textMuted }]}>
                  {subscription.isPro
                    ? en
                      ? `Active · ${subscription.daysLeft} days left`
                      : `Активна · осталось ${subscription.daysLeft} дн.`
                    : en
                    ? "Tap to activate IGSK-XXXX-XXXX-XXXX key"
                    : "Нажмите, чтобы активировать ключ IGSK-XXXX"}
                </Text>
              </View>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.brand }]}>
              <Text style={{ color: colors.onBrand, fontSize: 11.5, fontWeight: "800" }}>
                {subscription.isPro ? "PRO" : en ? "Activate" : "Ключ"}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Appearance */}
        <Text style={[styles.secLabel, { color: colors.textSubtle }]}>
          {en ? "APPEARANCE" : "ОФОРМЛЕНИЕ"}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 14 }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.settingLabel, { color: colors.text }]}>
              {en ? "Theme" : "Тема"}
            </Text>
            <View style={[styles.segWrap, { backgroundColor: colors.surface }]}>
              <TouchableOpacity
                onPress={() => updatePrefs({ theme: "dark" })}
                style={[styles.segBtn, prefs.theme === "dark" && { backgroundColor: colors.brand }]}
              >
                <Moon size={14} color={prefs.theme === "dark" ? colors.onBrand : colors.textMuted} />
                <Text style={{ color: prefs.theme === "dark" ? colors.onBrand : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
                  {en ? "Dark" : "Тёмная"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => updatePrefs({ theme: "light" })}
                style={[styles.segBtn, prefs.theme === "light" && { backgroundColor: colors.brand }]}
              >
                <Sun size={14} color={prefs.theme === "light" ? colors.onBrand : colors.textMuted} />
                <Text style={{ color: prefs.theme === "light" ? colors.onBrand : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
                  {en ? "Light" : "Светлая"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {prefs.theme === "dark" ? (
            <View style={{ gap: 8 }}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                {en ? "Accent color" : "Акцентный цвет"}
              </Text>
              <View style={styles.swatches}>
                {ACCENT_LIST.map((id) => {
                  const preset = ACCENT_PRESETS[id];
                  const active = prefs.accent === id;
                  return (
                    <TouchableOpacity
                      key={id}
                      onPress={() => updatePrefs({ accent: id })}
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: preset.brand,
                          borderWidth: active ? 3 : 1,
                          borderColor: active ? "#FFFFFF" : "rgba(255,255,255,0.2)",
                        },
                      ]}
                    >
                      {active ? <Check size={14} color={id === "black" ? "#0B0A0A" : "#FFFFFF"} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.rowBetween}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Globe size={16} color={colors.textMuted} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                {en ? "Language" : "Язык интерфейса"}
              </Text>
            </View>
            <View style={[styles.segWrap, { backgroundColor: colors.surface }]}>
              <TouchableOpacity
                onPress={() => updatePrefs({ lang: "ru" })}
                style={[styles.segBtn, prefs.lang === "ru" && { backgroundColor: colors.brand }]}
              >
                <Text style={{ color: prefs.lang === "ru" ? colors.onBrand : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
                  RU
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => updatePrefs({ lang: "en" })}
                style={[styles.segBtn, prefs.lang === "en" && { backgroundColor: colors.brand }]}
              >
                <Text style={{ color: prefs.lang === "en" ? colors.onBrand : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
                  EN
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.rowBetween}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Smartphone size={16} color={colors.textMuted} />
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                {en ? "Haptic feedback" : "Тактильный отклик"}
              </Text>
            </View>
            <Switch
              value={prefs.hapticsEnabled}
              onValueChange={(v) => updatePrefs({ hapticsEnabled: v })}
              trackColor={{ false: colors.surfaceElevated, true: colors.brand }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <Text style={[styles.versionNote, { color: colors.textSubtle }]}>
          IGseek Expo Go · v{IGSEEK_CONFIG.appVersion}
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: "800" },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  secLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 4 },
  card: { borderRadius: 16, borderWidth: 1, padding: 15, gap: 12 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 15, fontWeight: "800" },
  cardSub: { fontSize: 12.5, marginTop: 2 },
  syncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 10,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  settingLabel: { fontSize: 14, fontWeight: "700" },
  segWrap: { flexDirection: "row", borderRadius: 10, padding: 3, gap: 3 },
  segBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  versionNote: { textAlign: "center", fontSize: 12, marginTop: 8 },
});
