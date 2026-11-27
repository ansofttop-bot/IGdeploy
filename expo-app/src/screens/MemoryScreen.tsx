import * as Clipboard from "expo-clipboard";
import { Brain, Copy, Menu, MessageSquare, Plus, Search, Trash2, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "../state/AppContext";
import { MemoryEntryItem } from "../types/models";

const KINDS: Array<{ id: MemoryEntryItem["kind"]; ru: string; en: string }> = [
  { id: "preference", ru: "Предпочтения", en: "Preference" },
  { id: "fact", ru: "Факт", en: "Fact" },
  { id: "goal", ru: "Цель", en: "Goal" },
  { id: "work", ru: "Работа", en: "Work" },
  { id: "other", ru: "Другое", en: "Other" },
];

export const MemoryScreen: React.FC = () => {
  const {
    colors,
    prefs,
    setDrawerOpen,
    memories,
    addMemory,
    removeMemory,
    setDraftPrompt,
    setActiveTab,
    showToast,
  } = useApp();

  const en = prefs.lang === "en";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<MemoryEntryItem["kind"]>("fact");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memories.filter((m) => {
      if (filter !== "all" && m.kind !== filter) return false;
      if (q && !m.content.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, memories, query]);

  const handleSave = () => {
    if (!text.trim()) return;
    addMemory(text.trim(), kind);
    setText("");
    setModalOpen(false);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.iconBtn}>
          <Menu size={21} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Brain size={18} color={colors.brand} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {en ? "Memory" : "Память"}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setModalOpen(true)} style={styles.iconBtn}>
          <Plus size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Search size={15} color={colors.textSubtle} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={en ? "Search memories..." : "Поиск по памяти..."}
            placeholderTextColor={colors.textSubtle}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <TouchableOpacity
            onPress={() => setFilter("all")}
            style={[
              styles.chip,
              {
                backgroundColor: filter === "all" ? colors.brandSoft : colors.surface,
                borderColor: filter === "all" ? colors.brandBorder : colors.border,
              },
            ]}
          >
            <Text style={{ color: filter === "all" ? colors.brand : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
              {en ? "All" : "Все"}
            </Text>
          </TouchableOpacity>
          {KINDS.map((k) => {
            const sel = filter === k.id;
            return (
              <TouchableOpacity
                key={k.id}
                onPress={() => setFilter(k.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: sel ? colors.brandSoft : colors.surface,
                    borderColor: sel ? colors.brandBorder : colors.border,
                  },
                ]}
              >
                <Text style={{ color: sel ? colors.brand : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
                  {en ? k.en : k.ru}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {filtered.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Brain size={26} color={colors.textSubtle} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {en ? "No saved memories yet" : "Память пока пуста"}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {en
                ? "Add preferences, project details, or personal facts so IGseek remembers them across devices."
                : "Добавьте свои предпочтения, стек или важные факты — они синхронизируются на всех устройствах."}
            </Text>
            <TouchableOpacity
              onPress={() => setModalOpen(true)}
              style={[styles.addCta, { backgroundColor: colors.brand }]}
            >
              <Plus size={16} color={colors.onBrand} />
              <Text style={{ color: colors.onBrand, fontWeight: "700", fontSize: 13.5 }}>
                {en ? "Add memory" : "Добавить факт"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {filtered.map((item) => {
              const meta = KINDS.find((k) => k.id === item.kind) || KINDS[4];
              return (
                <View
                  key={item.id}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.cardTop}>
                    <View style={[styles.kindPill, { backgroundColor: colors.brandSoft }]}>
                      <Text style={{ color: colors.brand, fontSize: 11, fontWeight: "700" }}>
                        {en ? meta.en : meta.ru}
                      </Text>
                    </View>
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        onPress={() => {
                          setDraftPrompt(item.content);
                          setActiveTab("chat");
                        }}
                        hitSlop={8}
                      >
                        <MessageSquare size={15} color={colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={async () => {
                          await Clipboard.setStringAsync(item.content);
                          showToast(en ? "Copied" : "Скопировано");
                        }}
                        hitSlop={8}
                      >
                        <Copy size={15} color={colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => removeMemory(item.id)} hitSlop={8}>
                        <Trash2 size={15} color={colors.textSubtle} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={[styles.cardBody, { color: colors.text }]}>{item.content}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalOpen(false)} />
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {en ? "New memory" : "Новый факт в память"}
              </Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.kindGrid}>
              {KINDS.map((k) => {
                const sel = kind === k.id;
                return (
                  <TouchableOpacity
                    key={k.id}
                    onPress={() => setKind(k.id)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: sel ? colors.brandSoft : colors.surface,
                        borderColor: sel ? colors.brandBorder : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: sel ? colors.brand : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
                      {en ? k.en : k.ru}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={en ? "What should IGseek remember?" : "Что IGseek должен запомнить?"}
              placeholderTextColor={colors.textSubtle}
              multiline
              style={[
                styles.textarea,
                { backgroundColor: colors.inputBg, borderColor: colors.borderStrong, color: colors.text },
              ]}
            />
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.saveBtn, { backgroundColor: colors.brand }]}
            >
              <Text style={{ color: colors.onBrand, fontWeight: "700", fontSize: 14.5 }}>
                {en ? "Save" : "Сохранить"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  chipsRow: { gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center", gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  addCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 11,
    marginTop: 4,
  },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kindPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  cardBody: { fontSize: 14.5, lineHeight: 20.5 },
  overlay: { flex: 1, justifyContent: "center", padding: 20 },
  modalCard: { borderRadius: 20, borderWidth: 1, padding: 18, gap: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 16.5, fontWeight: "800" },
  kindGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  textarea: {
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    fontSize: 14.5,
    textAlignVertical: "top",
  },
  saveBtn: { paddingVertical: 13, borderRadius: 12, alignItems: "center" },
});
