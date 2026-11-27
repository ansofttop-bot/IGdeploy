import { CheckCircle2, Crown, KeyRound, Sparkles, X } from "./Icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "../state/AppContext";

export const ProModal: React.FC = () => {
  const { proModalOpen, setProModalOpen, colors, prefs, subscription, session, redeemKey } = useApp();
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const en = prefs.lang === "en";

  const handleRedeem = async () => {
    setError(null);
    if (!keyInput.trim()) {
      setError(en ? "Enter your IGSK-XXXX-XXXX-XXXX key" : "Введите ключ IGSK-XXXX-XXXX-XXXX");
      return;
    }
    setBusy(true);
    try {
      await redeemKey(keyInput.trim());
      setKeyInput("");
    } catch (err: any) {
      setError(err?.message || (en ? "Activation failed" : "Ошибка активации ключа"));
    } finally {
      setBusy(false);
    }
  };

  if (!proModalOpen) return null;

  return (
    <Modal
      visible={proModalOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setProModalOpen(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.overlay, { backgroundColor: colors.overlay }]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setProModalOpen(false)} />
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.borderStrong },
          ]}
        >
          <View style={styles.header}>
            <View style={[styles.badgeIcon, { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder }]}>
              <Crown size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>IGseek Pro</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                {subscription.isPro
                  ? en
                    ? `Active · ${subscription.daysLeft} days left`
                    : `Активна · осталось ${subscription.daysLeft} дн.`
                  : en
                  ? "Unlock priority DeepSeek models & sync"
                  : "Приоритетный DeepSeek, высокий контекст и синхронизация"}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setProModalOpen(false)} hitSlop={10}>
              <X size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={[styles.perksBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {[
              en ? "Priority IGseek Instinct & Pro routing" : "Приоритетный доступ к моделям IGseek Pro",
              en ? "Pollinations HD image generation" : "Генерация изображений через Pollinations",
              en ? "Instant Pro sync across Web, Android & iOS" : "Мгновенная синхронизация Pro на Web, Android и iOS",
              en ? "30 days per single-use license key" : "30 дней за каждый одноразовый ключ подписки",
            ].map((perk, idx) => (
              <View key={idx} style={styles.perkRow}>
                <CheckCircle2 size={15} color={colors.brand} />
                <Text style={[styles.perkText, { color: colors.text }]}>{perk}</Text>
              </View>
            ))}
          </View>

          {session?.isGuest ? (
            <Text style={[styles.warn, { color: colors.warning }]}>
              {en
                ? "Sign in with Google or Email in Settings before activating a key."
                : "Войдите через Google или почту в Настройках, чтобы активировать ключ."}
            </Text>
          ) : null}

          <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.borderStrong }]}>
            <KeyRound size={16} color={colors.textMuted} />
            <TextInput
              value={keyInput}
              onChangeText={(t) => {
                setKeyInput(t.toUpperCase());
                setError(null);
              }}
              placeholder="IGSK-XXXX-XXXX-XXXX"
              placeholderTextColor={colors.textSubtle}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.input, { color: colors.text }]}
            />
          </View>

          {error ? <Text style={[styles.errText, { color: colors.danger }]}>{error}</Text> : null}

          <TouchableOpacity
            onPress={handleRedeem}
            disabled={busy || session?.isGuest}
            style={[
              styles.submitBtn,
              {
                backgroundColor: colors.brand,
                opacity: busy || session?.isGuest ? 0.55 : 1,
              },
            ]}
            activeOpacity={0.85}
          >
            {busy ? (
              <ActivityIndicator color={colors.onBrand} size="small" />
            ) : (
              <>
                <Sparkles size={16} color={colors.onBrand} />
                <Text style={[styles.submitLabel, { color: colors.onBrand }]}>
                  {en ? "Activate key" : "Активировать ключ"}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  badgeIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12.5,
    marginTop: 2,
  },
  perksBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
    gap: 9,
  },
  perkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  perkText: {
    fontSize: 13,
    flex: 1,
  },
  warn: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    padding: 0,
  },
  errText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  submitLabel: {
    fontSize: 14.5,
    fontWeight: "700",
  },
});
