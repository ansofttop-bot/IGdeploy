import * as Clipboard from "expo-clipboard";
import { Bookmark, Copy, Menu, MessageSquare, Share2, Trash2 } from "../components/Icons";
import React, { useMemo, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useApp } from "../state/AppContext";

export const SavedScreen: React.FC = () => {
  const {
    colors,
    prefs,
    setDrawerOpen,
    chats,
    messagesByChat,
    selectChat,
    toggleSaveChat,
    toggleBookmarkMessage,
    showToast,
  } = useApp();

  const en = prefs.lang === "en";
  const [tab, setTab] = useState<"chats" | "answers">("chats");

  const savedChats = useMemo(() => chats.filter((c) => c.isSaved), [chats]);
  const savedAnswers = useMemo(() => {
    const out: Array<{ chatId: string; chatTitle: string; msgId: string; content: string }> = [];
    for (const c of chats) {
      const msgs = messagesByChat[c.id] || [];
      for (const m of msgs) {
        if (m.isBookmarked) {
          out.push({ chatId: c.id, chatTitle: c.title, msgId: m.id, content: m.content });
        }
      }
    }
    return out;
  }, [chats, messagesByChat]);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.iconBtn}>
          <Menu size={21} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Bookmark size={18} color={colors.brand} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {en ? "Saved" : "Избранное"}
          </Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.pad}>
        <View style={[styles.segWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => setTab("chats")}
            style={[styles.segBtn, tab === "chats" && { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: tab === "chats" ? colors.onBrand : colors.textMuted, fontSize: 13, fontWeight: "700" }}>
              {en ? `Chats (${savedChats.length})` : `Чаты (${savedChats.length})`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab("answers")}
            style={[styles.segBtn, tab === "answers" && { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: tab === "answers" ? colors.onBrand : colors.textMuted, fontSize: 13, fontWeight: "700" }}>
              {en ? `Answers (${savedAnswers.length})` : `Ответы (${savedAnswers.length})`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === "chats" ? (
          savedChats.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Bookmark size={24} color={colors.textSubtle} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {en ? "No saved chats" : "Нет сохранённых чатов"}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                {en
                  ? "Tap the bookmark icon in the chat header to pin important conversations here."
                  : "Нажмите на значок закладки в шапке чата, чтобы закрепить важный диалог."}
              </Text>
            </View>
          ) : (
            savedChats.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => selectChat(c.id)}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.rowBetween}>
                  <View style={styles.titleRow}>
                    <MessageSquare size={16} color={colors.brand} />
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
                      {c.title}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleSaveChat(c.id)} hitSlop={8}>
                    <Trash2 size={15} color={colors.textSubtle} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )
        ) : savedAnswers.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Bookmark size={24} color={colors.textSubtle} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {en ? "No saved answers" : "Нет сохранённых ответов"}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {en
                ? "Tap Save under any AI answer to keep it here for quick reference."
                : "Нажмите «Сохранить» под любым ответом ИИ, чтобы быстро возвращаться к нему."}
            </Text>
          </View>
        ) : (
          savedAnswers.map((a) => (
            <View
              key={a.msgId}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}
            >
              <View style={styles.rowBetween}>
                <Text style={{ color: colors.brand, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>
                  {a.chatTitle}
                </Text>
                <View style={{ flexDirection: "row", gap: 14 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      await Clipboard.setStringAsync(a.content);
                      showToast(en ? "Copied" : "Скопировано");
                    }}
                  >
                    <Copy size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => Share.share({ message: a.content }).catch(() => undefined)}>
                    <Share2 size={15} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => toggleBookmarkMessage(a.chatId, a.msgId)}>
                    <Trash2 size={15} color={colors.textSubtle} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[styles.answerText, { color: colors.text }]} numberOfLines={8}>
                {a.content}
              </Text>
            </View>
          ))
        )}
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  headerTitle: { fontSize: 16, fontWeight: "800" },
  pad: { paddingHorizontal: 16, paddingTop: 12 },
  segWrap: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  scroll: { padding: 16, gap: 10, paddingBottom: 32 },
  emptyCard: { borderRadius: 16, borderWidth: 1, padding: 24, alignItems: "center", gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { fontSize: 14.5, fontWeight: "700", flexShrink: 1 },
  answerText: { fontSize: 14, lineHeight: 20 },
});
