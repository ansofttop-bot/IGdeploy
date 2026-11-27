import * as Clipboard from "expo-clipboard";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Download,
  Menu,
  Play,
  RotateCcw,
  Sparkles,
  Workflow,
  XCircle,
} from "../components/Icons";
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
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { useApp } from "../state/AppContext";
import { FlowAutonomy } from "../types/models";

export const FlowScreen: React.FC = () => {
  const {
    colors,
    prefs,
    setDrawerOpen,
    flowTask,
    flowRunning,
    runFlowGoal,
    clearFlowTask,
    addLibraryFile,
    showToast,
  } = useApp();

  const en = prefs.lang === "en";
  const [goal, setGoal] = useState("");
  const [autonomy, setAutonomy] = useState<FlowAutonomy>("semi-auto");
  const [expandedStep, setExpandedStep] = useState<Record<string, boolean>>({});

  const scenarios = en
    ? [
        { tag: "Research", title: "Competitor landscape report", prompt: "Research the top 5 AI workspace apps, compare pricing & differentiators, and write an executive summary." },
        { tag: "Product", title: "Mobile app launch roadmap", prompt: "Design a 30-day GTM launch strategy for an AI mobile assistant with KPIs and growth loops." },
        { tag: "Engineering", title: "System architecture spec", prompt: "Design a resilient multi-tenant sync architecture with offline-first caching and auth security." },
      ]
    : [
        { tag: "Аналитика", title: "Обзор конкурентов и рынка", prompt: "Проведи анализ 5 главных ИИ-ассистентов, сравни их функции, цены и предложи стратегию дифференциации." },
        { tag: "Продукт", title: "План запуска приложения", prompt: "Составь 30-дневный план запуска мобильного ИИ-приложения с каналами привлечения и KPI." },
        { tag: "Архитектура", title: "Техническая спецификация", prompt: "Спроектируй отказоустойчивую архитектуру синхронизации данных между Web, iOS и Android." },
      ];

  const handleRun = (text?: string) => {
    const q = (text ?? goal).trim();
    if (!q) return;
    setGoal("");
    runFlowGoal(q, autonomy);
  };

  const handleSaveReport = () => {
    if (!flowTask) return;
    const md = `# ${flowTask.title}\n\n${flowTask.steps
      .map((s, idx) => `## ${idx + 1}. ${s.title}\n\n${s.output || ""}`)
      .join("\n\n")}`;
    addLibraryFile({
      name: `${flowTask.title.slice(0, 42)}.md`,
      type: "doc",
      mimeType: "text/markdown",
      sizeBytes: md.length,
      source: "flow",
      chatTitle: flowTask.title,
      content: md,
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
          <Workflow size={18} color={colors.brand} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>IGseek Flow</Text>
        </View>
        {flowTask ? (
          <TouchableOpacity onPress={clearFlowTask} style={styles.iconBtn}>
            <RotateCcw size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Autonomy Mode Switcher */}
          <View style={[styles.modeBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(
              [
                { id: "assist", label: en ? "Assist" : "Ассистент" },
                { id: "semi-auto", label: en ? "Semi-Auto" : "Полуавто" },
                { id: "autopilot", label: en ? "Autopilot" : "Автопилот" },
              ] as const
            ).map((m) => {
              const active = autonomy === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => setAutonomy(m.id)}
                  style={[
                    styles.modePill,
                    active && { backgroundColor: colors.brand },
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      { color: active ? colors.onBrand : colors.textMuted },
                    ]}
                  >
                    {m.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!flowTask ? (
            <>
              <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Sparkles size={22} color={colors.brand} />
                <Text style={[styles.heroTitle, { color: colors.text }]}>
                  {en ? "Autonomous multi-step agent" : "Автономный пошаговый агент"}
                </Text>
                <Text style={[styles.heroSub, { color: colors.textMuted }]}>
                  {en
                    ? "Describe a goal — IGseek Flow plans steps, executes research & delivers a full report."
                    : "Опишите задачу — IGseek Flow разобьёт её на шаги, выполнит каждый и соберёт итоговый отчёт."}
                </Text>
              </View>

              <Text style={[styles.secLabel, { color: colors.textSubtle }]}>
                {en ? "READY SCENARIOS" : "ГОТОВЫЕ СЦЕНАРИИ"}
              </Text>
              <View style={{ gap: 10 }}>
                {scenarios.map((sc, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => handleRun(sc.prompt)}
                    style={[styles.scenarioCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.tagPill, { backgroundColor: colors.brandSoft }]}>
                      <Text style={{ color: colors.brand, fontSize: 11, fontWeight: "700" }}>
                        {sc.tag}
                      </Text>
                    </View>
                    <Text style={[styles.scTitle, { color: colors.text }]}>{sc.title}</Text>
                    <Text style={[styles.scPrompt, { color: colors.textMuted }]} numberOfLines={2}>
                      {sc.prompt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <View style={{ gap: 12 }}>
              <View style={[styles.taskHeaderCard, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
                <Text style={[styles.taskTitle, { color: colors.text }]}>{flowTask.title}</Text>
                <Text style={[styles.taskMeta, { color: colors.textMuted }]}>
                  {flowTask.status === "planning"
                    ? en
                      ? "Planning steps..."
                      : "Планирование шагов..."
                    : flowTask.status === "running"
                    ? en
                      ? "Executing workflow..."
                      : "Выполнение шагов..."
                    : en
                    ? "Completed"
                    : "Завершено"}
                </Text>
                {flowTask.status === "done" ? (
                  <View style={styles.taskActions}>
                    <TouchableOpacity
                      onPress={handleSaveReport}
                      style={[styles.smallBtn, { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder }]}
                    >
                      <Download size={13} color={colors.brand} />
                      <Text style={{ color: colors.brand, fontSize: 12.5, fontWeight: "700" }}>
                        {en ? "Save report" : "В библиотеку"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        const txt = flowTask.steps.map((s) => `${s.title}\n${s.output || ""}`).join("\n\n");
                        await Clipboard.setStringAsync(txt);
                        showToast(en ? "Copied!" : "Скопировано!");
                      }}
                      style={[styles.smallBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    >
                      <Copy size={13} color={colors.textMuted} />
                      <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>
                        {en ? "Copy" : "Копировать"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {flowTask.steps.map((step, idx) => {
                const open = expandedStep[step.id] ?? (step.status === "done" && idx === flowTask.steps.length - 1);
                return (
                  <View
                    key={step.id}
                    style={[
                      styles.stepCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor:
                          step.status === "running" ? colors.brandBorder : colors.border,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() =>
                        setExpandedStep((p) => ({ ...p, [step.id]: !open }))
                      }
                      style={styles.stepTop}
                      activeOpacity={0.75}
                    >
                      {step.status === "done" ? (
                        <CheckCircle2 size={18} color={colors.success} />
                      ) : step.status === "running" ? (
                        <ActivityIndicator size="small" color={colors.brand} />
                      ) : step.status === "error" ? (
                        <XCircle size={18} color={colors.danger} />
                      ) : (
                        <Circle size={18} color={colors.textSubtle} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.stepTitle, { color: colors.text }]}>
                          {idx + 1}. {step.title}
                        </Text>
                        {step.description ? (
                          <Text style={[styles.stepDesc, { color: colors.textMuted }]}>
                            {step.description}
                          </Text>
                        ) : null}
                      </View>
                      {step.output ? (
                        open ? (
                          <ChevronUp size={16} color={colors.textMuted} />
                        ) : (
                          <ChevronDown size={16} color={colors.textMuted} />
                        )
                      ) : null}
                    </TouchableOpacity>
                    {open && step.output ? (
                      <View style={[styles.stepOutput, { borderTopColor: colors.border }]}>
                        <MarkdownRenderer content={step.output} colors={colors} lang={prefs.lang} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Bottom Goal Input */}
        <View style={[styles.bottomBar, { borderTopColor: colors.border, backgroundColor: colors.bg }]}>
          <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.borderStrong }]}>
            <TextInput
              value={goal}
              onChangeText={setGoal}
              placeholder={en ? "Enter a goal for Flow..." : "Опишите цель для Flow..."}
              placeholderTextColor={colors.textSubtle}
              style={[styles.input, { color: colors.text }]}
              onSubmitEditing={() => handleRun()}
              editable={!flowRunning}
            />
            <TouchableOpacity
              onPress={() => handleRun()}
              disabled={flowRunning || !goal.trim()}
              style={[
                styles.runBtn,
                { backgroundColor: goal.trim() && !flowRunning ? colors.brand : colors.surfaceElevated },
              ]}
            >
              {flowRunning ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Play size={15} color={goal.trim() ? colors.onBrand : colors.textSubtle} />
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
  scroll: { padding: 16, gap: 14, paddingBottom: 28 },
  modeBar: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  modePill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: "center",
  },
  modeText: { fontSize: 12.5, fontWeight: "700" },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  heroTitle: { fontSize: 18, fontWeight: "800" },
  heroSub: { fontSize: 13.5, lineHeight: 19 },
  secLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  scenarioCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  tagPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  scTitle: { fontSize: 14.5, fontWeight: "700" },
  scPrompt: { fontSize: 12.5, lineHeight: 17.5 },
  taskHeaderCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  taskTitle: { fontSize: 16.5, fontWeight: "800" },
  taskMeta: { fontSize: 12.5 },
  taskActions: { flexDirection: "row", gap: 8, marginTop: 6 },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },
  stepCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  stepTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
  },
  stepTitle: { fontSize: 14, fontWeight: "700" },
  stepDesc: { fontSize: 12, marginTop: 2 },
  stepOutput: {
    borderTopWidth: 1,
    padding: 14,
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
  runBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
