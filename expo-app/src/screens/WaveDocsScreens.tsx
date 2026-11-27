import * as WebBrowser from "expo-web-browser";
import {
  AudioWaveform,
  BookOpen,
  ExternalLink,
  FileText,
  Menu,
  MessageSquare,
  Mic,
  Radio,
  Shield,
  Sparkles,
} from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { IGSEEK_CONFIG } from "../config";
import { useApp } from "../state/AppContext";

export const WaveScreen: React.FC = () => {
  const { colors, prefs, setDrawerOpen, setActiveTab } = useApp();
  const en = prefs.lang === "en";
  const bars = useRef([0, 1, 2, 3, 4, 5, 6].map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    const anims = bars.map((val, idx) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1,
            duration: 460 + idx * 90,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0.25,
            duration: 460 + idx * 90,
            useNativeDriver: true,
          }),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [bars]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.iconBtn}>
          <Menu size={21} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <AudioWaveform size={18} color={colors.brand} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>IGseek Wave</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.waveHero, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
          <View style={styles.barsRow}>
            {bars.map((v, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.bar,
                  {
                    backgroundColor: colors.brand,
                    transform: [{ scaleY: v }],
                  },
                ]}
              />
            ))}
          </View>
          <View style={[styles.pill, { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder }]}>
            <Text style={{ color: colors.brand, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 }}>
              {en ? "NEXT-GEN VOICE STUDIO" : "ГОЛОСОВАЯ СТУДИЯ"}
            </Text>
          </View>
          <Text style={[styles.heroTitle, { color: colors.text }]}>
            {en ? "Real-time AI voice & audio" : "Живой голос и аудио-ИИ"}
          </Text>
          <Text style={[styles.heroSub, { color: colors.textMuted }]}>
            {en
              ? "Low-latency voice conversations, meeting notes, and studio narration powered by IGseek."
              : "Голосовой диалог без задержек, расшифровка встреч и студийная озвучка прямо в IGseek."}
          </Text>

          <TouchableOpacity
            onPress={() => setActiveTab("chat")}
            style={[styles.ctaBtn, { backgroundColor: colors.brand }]}
          >
            <MessageSquare size={16} color={colors.onBrand} />
            <Text style={{ color: colors.onBrand, fontWeight: "700", fontSize: 14 }}>
              {en ? "Open Chat" : "Перейти в чат"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.grid}>
          {[
            { icon: Mic, title: en ? "Live Voice" : "Живой диалог", desc: en ? "Natural hands-free conversations" : "Естественное общение голосом" },
            { icon: Radio, title: en ? "Podcast Notes" : "Конспекты", desc: en ? "Instant summaries from audio" : "Мгновенная выжимка из аудио" },
            { icon: Sparkles, title: en ? "Voice Personas" : "Голоса агентов", desc: en ? "Distinct tone for each IGseek agent" : "Уникальный тембр для каждого агента" },
          ].map((c, idx) => {
            const Icon = c.icon;
            return (
              <View key={idx} style={[styles.featCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Icon size={18} color={colors.brand} />
                <Text style={[styles.featTitle, { color: colors.text }]}>{c.title}</Text>
                <Text style={[styles.featDesc, { color: colors.textMuted }]}>{c.desc}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

export const DocsScreen: React.FC = () => {
  const { colors, prefs, setDrawerOpen, setDraftPrompt, setActiveTab } = useApp();
  const en = prefs.lang === "en";
  const base = IGSEEK_CONFIG.apiBaseUrl;

  const legalLinks = [
    { title: en ? "Privacy Policy" : "Политика конфиденциальности", url: `${base}/docs/privacy` },
    { title: en ? "Terms of Service" : "Пользовательское соглашение", url: `${base}/docs/terms` },
    { title: en ? "IGseek Web App" : "Открыть веб-версию IGseek", url: base },
  ];

  const guides = en
    ? [
        { title: "Generate HD Images", desc: "Type /img followed by any scene, or toggle the image button in chat to use Pollinations.", prompt: "/img cinematic dark studio portrait of a geometric crimson fox, 8k" },
        { title: "Deep Reasoning Mode", desc: "Enable the Brain toggle in chat to see step-by-step DeepSeek reasoning before the final answer.", prompt: "Solve and explain step by step: how to design a rate limiter for 100k RPS?" },
        { title: "Cross-Platform Pro Keys", desc: "Redeem any IGSK-XXXX-XXXX-XXXX key once in Settings — Pro syncs instantly to Web, Android & iOS.", prompt: "Tell me all the best workflows I can run in IGseek Flow and Engine" },
      ]
    : [
        { title: "Генерация фото Pollinations", desc: "Напишите /img и описание или включите иконку картинки в чате — доступно на всех тарифах.", prompt: "/img кинематографичный тёмный портрет геометрического красного лиса, 8k" },
        { title: "Режим рассуждений DeepSeek", desc: "Включите значок мозга в поле ввода, чтобы видеть ход мыслей модели перед итоговым ответом.", prompt: "Разбери пошагово, как спроектировать высоконагруженный кэш с защитой от промахов" },
        { title: "Единая подписка и облако", desc: "Активируйте ключ IGSK-XXXX-XXXX-XXXX в Настройках — Pro сразу заработает на Web, Android и iOS.", prompt: "Какие сценарии лучше всего запускать в IGseek Flow и Engine?" },
      ];

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.iconBtn}>
          <Menu size={21} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <FileText size={18} color={colors.brand} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {en ? "Docs & Guides" : "Документы и гайды"}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.secLabel, { color: colors.textSubtle }]}>
          {en ? "QUICK GUIDES" : "БЫСТРЫЕ ГАЙДЫ"}
        </Text>
        {guides.map((g, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => {
              setDraftPrompt(g.prompt);
              setActiveTab("chat");
            }}
            style={[styles.docCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.titleRow}>
              <BookOpen size={16} color={colors.brand} />
              <Text style={[styles.docTitle, { color: colors.text }]}>{g.title}</Text>
            </View>
            <Text style={[styles.docDesc, { color: colors.textMuted }]}>{g.desc}</Text>
          </TouchableOpacity>
        ))}

        <Text style={[styles.secLabel, { color: colors.textSubtle, marginTop: 8 }]}>
          {en ? "LEGAL & LINKS" : "ДОКУМЕНТЫ И ССЫЛКИ"}
        </Text>
        {legalLinks.map((l, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => WebBrowser.openBrowserAsync(l.url).catch(() => undefined)}
            style={[styles.linkRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Shield size={16} color={colors.textMuted} />
            <Text style={[styles.linkTitle, { color: colors.text }]}>{l.title}</Text>
            <ExternalLink size={15} color={colors.textSubtle} />
          </TouchableOpacity>
        ))}
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
  scroll: { padding: 16, gap: 12, paddingBottom: 32 },
  waveHero: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 22,
    alignItems: "center",
    gap: 12,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 54,
    gap: 7,
    marginBottom: 4,
  },
  bar: { width: 7, height: 46, borderRadius: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  heroTitle: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  heroSub: { fontSize: 13.5, textAlign: "center", lineHeight: 19.5 },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 4,
  },
  grid: { gap: 10 },
  featCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  featTitle: { fontSize: 14.5, fontWeight: "700" },
  featDesc: { fontSize: 12.5, lineHeight: 18 },
  secLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  docCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 6 },
  docTitle: { fontSize: 14.5, fontWeight: "700" },
  docDesc: { fontSize: 13, lineHeight: 18.5 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 13,
    borderWidth: 1,
  },
  linkTitle: { fontSize: 14, fontWeight: "600", flex: 1 },
});
