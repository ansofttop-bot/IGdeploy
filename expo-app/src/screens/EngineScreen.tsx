import * as Clipboard from "expo-clipboard";
import {
  Code2,
  Copy,
  Download,
  Eye,
  Menu,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
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
import { WebView } from "react-native-webview";
import { buildEnginePreviewHtml } from "../services/api";
import { useApp } from "../state/AppContext";

export const EngineScreen: React.FC = () => {
  const {
    colors,
    prefs,
    setDrawerOpen,
    engineProjects,
    activeEngineId,
    setActiveEngineId,
    engineBusy,
    buildEngineApp,
    removeEngineProject,
    addLibraryFile,
    showToast,
  } = useApp();

  const en = prefs.lang === "en";
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");

  const activeProject = useMemo(
    () => engineProjects.find((p) => p.id === activeEngineId) || engineProjects[0] || null,
    [engineProjects, activeEngineId]
  );

  const currentFile = useMemo(() => {
    if (!activeProject) return null;
    return (
      activeProject.files.find((f) => f.path === selectedFile) ||
      activeProject.files.find((f) => f.path === activeProject.activeFile) ||
      activeProject.files[0] ||
      null
    );
  }, [activeProject, selectedFile]);

  const previewHtml = useMemo(
    () => (activeProject ? buildEnginePreviewHtml(activeProject) : ""),
    [activeProject]
  );

  const templates = en
    ? [
        { title: "Pomodoro Timer", prompt: "Build a sleek dark Pomodoro focus timer with session ring, presets and sound toggle" },
        { title: "Crypto Tracker UI", prompt: "Build an interactive dark portfolio dashboard with live price cards and allocation chart" },
        { title: "Habit Grid", prompt: "Build a minimalist weekly habit tracker with streaks and localStorage persistence" },
        { title: "Calculator Pro", prompt: "Build a tactile scientific calculator with expression history and glass aesthetic" },
      ]
    : [
        { title: "Таймер Помодоро", prompt: "Сделай стильный тёмный Pomodoro-таймер с кольцом прогресса, пресетами и счётчиком сессий" },
        { title: "Финансовый трекер", prompt: "Сделай интерактивный тёмный трекер расходов с категориями, графиком и сохранением в localStorage" },
        { title: "Трекер привычек", prompt: "Сделай минималистичный трекер привычек на неделю со стриками и быстрыми отметками" },
        { title: "Умный калькулятор", prompt: "Сделай современный инженерный калькулятор с историей вычислений в тёмном стиле" },
      ];

  const handleGenerate = async (customPrompt?: string, refine = false) => {
    const q = (customPrompt ?? prompt).trim();
    if (!q) return;
    setPrompt("");
    await buildEngineApp(q, refine);
    setViewMode("preview");
  };

  const handleCopyCode = async () => {
    if (!currentFile) return;
    await Clipboard.setStringAsync(currentFile.content);
    showToast(en ? "Code copied" : "Код скопирован");
  };

  const handleSaveToLibrary = () => {
    if (!activeProject) return;
    const bundle = activeProject.files
      .map((f) => `// ===== ${f.path} =====\n${f.content}`)
      .join("\n\n");
    addLibraryFile({
      name: `${activeProject.title.slice(0, 40)}.html`,
      type: "code",
      mimeType: "text/html",
      sizeBytes: bundle.length,
      source: "engine",
      chatTitle: activeProject.title,
      content: previewHtml,
      dataUrl: null,
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.iconBtn}>
          <Menu size={21} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Code2 size={18} color={colors.brand} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>IGseek Engine</Text>
        </View>
        {activeProject ? (
          <TouchableOpacity onPress={() => setActiveEngineId("__new__")} style={styles.iconBtn}>
            <Plus size={20} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      {/* Saved projects pill strip */}
      {engineProjects.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.projStrip, { borderBottomColor: colors.border }]}
        >
          {engineProjects.map((p) => {
            const active = activeProject?.id === p.id && activeEngineId !== "__new__";
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => {
                  setActiveEngineId(p.id);
                  setSelectedFile(null);
                }}
                onLongPress={() => removeEngineProject(p.id)}
                style={[
                  styles.projChip,
                  {
                    backgroundColor: active ? colors.brandSoft : colors.surface,
                    borderColor: active ? colors.brandBorder : colors.border,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: active ? colors.brand : colors.text,
                    fontSize: 12,
                    fontWeight: "700",
                    maxWidth: 140,
                  }}
                >
                  {p.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {!activeProject || activeEngineId === "__new__" ? (
          <ScrollView contentContainerStyle={styles.emptyScroll} showsVerticalScrollIndicator={false}>
            <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Sparkles size={24} color={colors.brand} />
              <Text style={[styles.heroTitle, { color: colors.text }]}>
                {en ? "Build live web apps in seconds" : "Создавайте живые веб-приложения"}
              </Text>
              <Text style={[styles.heroSub, { color: colors.textMuted }]}>
                {en
                  ? "Describe an app or pick a starter — run it live right here or inspect the code."
                  : "Опишите идею или выберите шаблон — приложение запустится прямо здесь в Live Preview."}
              </Text>
            </View>

            <View style={styles.tplGrid}>
              {templates.map((t, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => handleGenerate(t.prompt, false)}
                  disabled={engineBusy}
                  style={[styles.tplCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Text style={[styles.tplTitle, { color: colors.text }]}>{t.title}</Text>
                  <Text style={[styles.tplPrompt, { color: colors.textMuted }]} numberOfLines={2}>
                    {t.prompt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>
            {/* Preview | Code Switcher + Actions */}
            <View style={[styles.toolbar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={[styles.segWrap, { backgroundColor: colors.bg }]}>
                <TouchableOpacity
                  onPress={() => setViewMode("preview")}
                  style={[styles.segBtn, viewMode === "preview" && { backgroundColor: colors.brand }]}
                >
                  <Eye size={14} color={viewMode === "preview" ? colors.onBrand : colors.textMuted} />
                  <Text style={{ color: viewMode === "preview" ? colors.onBrand : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
                    Preview
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setViewMode("code")}
                  style={[styles.segBtn, viewMode === "code" && { backgroundColor: colors.brand }]}
                >
                  <Code2 size={14} color={viewMode === "code" ? colors.onBrand : colors.textMuted} />
                  <Text style={{ color: viewMode === "code" ? colors.onBrand : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
                    Code
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.toolRight}>
                <TouchableOpacity onPress={handleSaveToLibrary} style={styles.smallIcon}>
                  <Download size={16} color={colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeEngineProject(activeProject.id)} style={styles.smallIcon}>
                  <Trash2 size={16} color={colors.textSubtle} />
                </TouchableOpacity>
              </View>
            </View>

            {viewMode === "preview" ? (
              <View style={{ flex: 1, backgroundColor: "#0B0A0A" }}>
                <WebView
                  originWhitelist={["*"]}
                  source={{ html: previewHtml }}
                  javaScriptEnabled
                  domStorageEnabled
                  style={{ flex: 1, backgroundColor: "#0B0A0A" }}
                />
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.fileTabs, { borderBottomColor: colors.border }]}
                >
                  {activeProject.files.map((f) => {
                    const sel = currentFile?.path === f.path;
                    return (
                      <TouchableOpacity
                        key={f.path}
                        onPress={() => setSelectedFile(f.path)}
                        style={[
                          styles.fileTab,
                          {
                            backgroundColor: sel ? colors.brandSoft : colors.surface,
                            borderColor: sel ? colors.brandBorder : colors.border,
                          },
                        ]}
                      >
                        <Text style={{ color: sel ? colors.brand : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
                          {f.path}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity onPress={handleCopyCode} style={[styles.fileTab, { borderColor: colors.border }]}>
                    <Copy size={13} color={colors.textMuted} />
                  </TouchableOpacity>
                </ScrollView>
                <ScrollView
                  style={{ flex: 1, backgroundColor: colors.codeBg }}
                  contentContainerStyle={{ padding: 14 }}
                >
                  <Text style={styles.codeContent} selectable>
                    {currentFile?.content || ""}
                  </Text>
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* Prompt / Refine bar */}
        <View style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.borderStrong }]}>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder={
                activeProject && activeEngineId !== "__new__"
                  ? en
                    ? "Refine this app..."
                    : "Улучшить это приложение..."
                  : en
                  ? "Describe an app to build..."
                  : "Опишите приложение для создания..."
              }
              placeholderTextColor={colors.textSubtle}
              style={[styles.input, { color: colors.text }]}
              editable={!engineBusy}
              onSubmitEditing={() =>
                handleGenerate(undefined, Boolean(activeProject && activeEngineId !== "__new__"))
              }
            />
            <TouchableOpacity
              onPress={() =>
                handleGenerate(undefined, Boolean(activeProject && activeEngineId !== "__new__"))
              }
              disabled={engineBusy || !prompt.trim()}
              style={[
                styles.sendBtn,
                { backgroundColor: prompt.trim() && !engineBusy ? colors.brand : colors.surfaceElevated },
              ]}
            >
              {engineBusy ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Send size={15} color={prompt.trim() ? colors.onBrand : colors.textSubtle} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
  projStrip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  projChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  emptyScroll: { padding: 16, gap: 16 },
  hero: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 8 },
  heroTitle: { fontSize: 18, fontWeight: "800" },
  heroSub: { fontSize: 13.5, lineHeight: 19 },
  tplGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tplCard: { width: "48%", borderRadius: 14, borderWidth: 1, padding: 13, gap: 5 },
  tplTitle: { fontSize: 14, fontWeight: "700" },
  tplPrompt: { fontSize: 12, lineHeight: 16.5 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  segWrap: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },
  segBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toolRight: { flexDirection: "row", gap: 6 },
  smallIcon: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  fileTabs: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  fileTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  codeContent: {
    color: "#E4E4E7",
    fontFamily: "Courier",
    fontSize: 12.5,
    lineHeight: 19,
  },
  bottomBar: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: { flex: 1, fontSize: 14.5, paddingVertical: 6 },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
