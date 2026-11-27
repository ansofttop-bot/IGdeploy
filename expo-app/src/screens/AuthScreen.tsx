import { ArrowRight, Globe, Lock, Mail, Moon, Sun, User } from "../components/Icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { IGseekFoxLogo } from "../components/BrandMark";
import { useApp } from "../state/AppContext";

export const AuthScreen: React.FC = () => {
  const {
    colors,
    prefs,
    updatePrefs,
    authBusy,
    loginEmail,
    registerEmail,
    loginGoogle,
    continueAsGuest,
  } = useApp();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const en = prefs.lang === "en";

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError(en ? "Enter email and password" : "Введите почту и пароль");
      return;
    }
    if (mode === "register" && password.length < 6) {
      setError(en ? "Password must be at least 6 characters" : "Пароль должен быть не короче 6 символов");
      return;
    }
    try {
      if (mode === "login") {
        await loginEmail(email, password);
      } else {
        await registerEmail(email, password, name);
      }
    } catch (err: any) {
      setError(err?.message || (en ? "Sign-in failed" : "Не удалось войти"));
    }
  };

  const handleGoogle = async () => {
    setError(null);
    try {
      await loginGoogle();
    } catch (err: any) {
      setError(err?.message || (en ? "Google sign-in failed" : "Ошибка входа через Google"));
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {/* Top utility pills */}
        <View style={styles.topRow}>
          <TouchableOpacity
            onPress={() => updatePrefs({ lang: en ? "ru" : "en" })}
            style={[styles.utilBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Globe size={15} color={colors.textMuted} />
            <Text style={[styles.utilText, { color: colors.text }]}>{en ? "EN" : "RU"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => updatePrefs({ theme: prefs.theme === "dark" ? "light" : "dark" })}
            style={[styles.utilBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            {prefs.theme === "dark" ? (
              <Sun size={15} color={colors.textMuted} />
            ) : (
              <Moon size={15} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View
              style={[
                styles.logoBadge,
                { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder },
              ]}
            >
              <IGseekFoxLogo size={38} color={colors.brand} />
            </View>
            <Text style={[styles.headline, { color: colors.text }]}>IGseek</Text>
            <Text style={[styles.subhead, { color: colors.textMuted }]}>
              {en
                ? "One chat. Many minds. Synced across Web, Android & iOS."
                : "Один чат. Много умов. Синхронизация между Web, Android и iOS."}
            </Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.borderStrong },
            ]}
          >
            {/* Segmented switch */}
            <View style={[styles.segWrap, { backgroundColor: colors.surface }]}>
              <TouchableOpacity
                onPress={() => {
                  setMode("login");
                  setError(null);
                }}
                style={[
                  styles.segBtn,
                  mode === "login" && { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text
                  style={[
                    styles.segLabel,
                    { color: mode === "login" ? colors.text : colors.textMuted },
                  ]}
                >
                  {en ? "Sign in" : "Вход"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setMode("register");
                  setError(null);
                }}
                style={[
                  styles.segBtn,
                  mode === "register" && { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                ]}
              >
                <Text
                  style={[
                    styles.segLabel,
                    { color: mode === "register" ? colors.text : colors.textMuted },
                  ]}
                >
                  {en ? "Create account" : "Регистрация"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Google Sign-In */}
            <TouchableOpacity
              onPress={handleGoogle}
              disabled={authBusy}
              style={[
                styles.googleBtn,
                { backgroundColor: colors.surface, borderColor: colors.borderStrong },
              ]}
              activeOpacity={0.8}
            >
              <Text style={[styles.googleG, { color: colors.brand }]}>G</Text>
              <Text style={[styles.googleText, { color: colors.text }]}>
                {en ? "Continue with Google" : "Продолжить через Google"}
              </Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textSubtle }]}>
                {en ? "or with email" : "или по почте"}
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {mode === "register" ? (
              <View style={[styles.field, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                <User size={16} color={colors.textSubtle} />
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder={en ? "Your name" : "Ваше имя"}
                  placeholderTextColor={colors.textSubtle}
                  style={[styles.input, { color: colors.text }]}
                />
              </View>
            ) : null}

            <View style={[styles.field, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Mail size={16} color={colors.textSubtle} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="name@example.com"
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                style={[styles.input, { color: colors.text }]}
              />
            </View>

            <View style={[styles.field, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Lock size={16} color={colors.textSubtle} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={en ? "Password" : "Пароль"}
                placeholderTextColor={colors.textSubtle}
                secureTextEntry
                style={[styles.input, { color: colors.text }]}
                onSubmitEditing={handleSubmit}
              />
            </View>

            {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={authBusy}
              style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: authBusy ? 0.7 : 1 }]}
              activeOpacity={0.85}
            >
              {authBusy ? (
                <ActivityIndicator color={colors.onBrand} size="small" />
              ) : (
                <>
                  <Text style={[styles.primaryLabel, { color: colors.onBrand }]}>
                    {mode === "login" ? (en ? "Sign in" : "Войти") : en ? "Create account" : "Создать аккаунт"}
                  </Text>
                  <ArrowRight size={17} color={colors.onBrand} />
                </>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={continueAsGuest} style={styles.guestBtn} activeOpacity={0.7}>
            <Text style={[styles.guestText, { color: colors.textMuted }]}>
              {en ? "Continue as guest (local only)" : "Продолжить без входа (локально)"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  utilBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  utilText: {
    fontSize: 12,
    fontWeight: "700",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  hero: {
    alignItems: "center",
    marginBottom: 24,
  },
  logoBadge: {
    width: 66,
    height: 66,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  headline: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  subhead: {
    fontSize: 13.5,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 300,
    lineHeight: 19,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  segWrap: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: "center",
  },
  segLabel: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  googleG: {
    fontSize: 17,
    fontWeight: "900",
  },
  googleText: {
    fontSize: 14.5,
    fontWeight: "700",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  input: {
    flex: 1,
    fontSize: 14.5,
    padding: 0,
  },
  errorText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 2,
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  guestBtn: {
    alignItems: "center",
    paddingVertical: 16,
  },
  guestText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
