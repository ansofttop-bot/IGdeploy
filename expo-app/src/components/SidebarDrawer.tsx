import {
  AudioWaveform,
  Bookmark,
  Brain,
  Code2,
  Crown,
  FileText,
  Folder,
  FolderPlus,
  Library,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Trash2,
  Workflow,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../state/AppContext";
import { IGseekTab } from "../types/models";
import { IGseekWordmark } from "./BrandMark";

const DRAWER_WIDTH = Math.min(Dimensions.get("window").width * 0.84, 326);

export const SidebarDrawer: React.FC = () => {
  const {
    drawerOpen,
    setDrawerOpen,
    colors,
    prefs,
    activeTab,
    setActiveTab,
    chats,
    activeChatId,
    selectChat,
    createNewChat,
    deleteChat,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    createProjectFolder,
    deleteProjectFolder,
    subscription,
    setProModalOpen,
    session,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const en = prefs.lang === "en";

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return chats.filter((c) => {
      if (selectedProjectId && c.projectId !== selectedProjectId) return false;
      if (q && !c.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [chats, searchQuery, selectedProjectId]);

  const navItems: Array<{ id: IGseekTab; label: string; icon: any; tag?: string }> = [
    { id: "chat", label: en ? "Chat" : "Чат", icon: MessageSquare },
    { id: "flow", label: "Flow", icon: Workflow, tag: "AI" },
    { id: "library", label: en ? "Library" : "Библиотека", icon: Library },
    { id: "saved", label: en ? "Saved" : "Избранное", icon: Bookmark },
    { id: "engine", label: "Engine", icon: Code2, tag: "BETA" },
    { id: "wave", label: "Wave", icon: AudioWaveform },
    { id: "docs", label: en ? "Docs" : "Документы", icon: FileText },
  ];

  const handleNav = (id: IGseekTab) => {
    setActiveTab(id);
    setDrawerOpen(false);
  };

  const handleAddFolder = () => {
    if (folderName.trim()) {
      createProjectFolder(folderName.trim());
      setFolderName("");
      setCreatingFolder(false);
    }
  };

  if (!drawerOpen) return null;

  return (
    <Modal
      visible={drawerOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setDrawerOpen(false)}
    >
      <View style={styles.backdropRow}>
        <Animated.View
          style={[
            styles.drawer,
            {
              width: DRAWER_WIDTH,
              backgroundColor: colors.sidebarBg,
              borderRightColor: colors.border,
            },
          ]}
        >
          <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
            {/* Top Brand Row */}
            <View style={styles.topRow}>
              <IGseekWordmark
                color={colors.text}
                brandColor={colors.brand}
                size={19}
                showBadge={subscription.isPro}
              />
              <TouchableOpacity
                onPress={() => setDrawerOpen(false)}
                style={[styles.iconBtn, { borderColor: colors.border }]}
                activeOpacity={0.7}
              >
                <X size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Primary New Chat CTA (Web-matched pill) */}
            <TouchableOpacity
              onPress={() => createNewChat(selectedProjectId)}
              style={[
                styles.newChatBtn,
                {
                  backgroundColor: colors.brand,
                },
              ]}
              activeOpacity={0.85}
            >
              <Plus size={18} color={colors.onBrand} strokeWidth={2.5} />
              <Text style={[styles.newChatLabel, { color: colors.onBrand }]}>
                {en ? "New chat" : "Новый чат"}
              </Text>
            </TouchableOpacity>

            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Workspaces */}
              <Text style={[styles.sectionTitle, { color: colors.textSubtle }]}>
                {en ? "WORKSPACE" : "ПРОСТРАНСТВА"}
              </Text>
              <View style={styles.navGroup}>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => handleNav(item.id)}
                      style={[
                        styles.navRow,
                        active && {
                          backgroundColor: colors.brandSoft,
                          borderColor: colors.brandBorder,
                          borderWidth: 1,
                        },
                      ]}
                      activeOpacity={0.75}
                    >
                      <Icon
                        size={17}
                        color={active ? colors.brand : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.navLabel,
                          {
                            color: active ? colors.text : colors.textMuted,
                            fontWeight: active ? "700" : "500",
                          },
                        ]}
                      >
                        {item.label}
                      </Text>
                      {item.tag ? (
                        <View
                          style={[
                            styles.miniTag,
                            { backgroundColor: colors.surfaceElevated },
                          ]}
                        >
                          <Text style={[styles.miniTagText, { color: colors.textMuted }]}>
                            {item.tag}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Folders / Projects */}
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.textSubtle, marginTop: 0 }]}>
                  {en ? "FOLDERS" : "ПАПКИ"}
                </Text>
                <TouchableOpacity onPress={() => setCreatingFolder((v) => !v)} hitSlop={8}>
                  <FolderPlus size={15} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {creatingFolder ? (
                <View style={[styles.folderInputRow, { backgroundColor: colors.inputBg, borderColor: colors.borderStrong }]}>
                  <TextInput
                    value={folderName}
                    onChangeText={setFolderName}
                    placeholder={en ? "Folder name..." : "Название папки..."}
                    placeholderTextColor={colors.textSubtle}
                    style={[styles.folderInput, { color: colors.text }]}
                    onSubmitEditing={handleAddFolder}
                    autoFocus
                  />
                  <TouchableOpacity onPress={handleAddFolder}>
                    <Text style={{ color: colors.brand, fontWeight: "700", fontSize: 13 }}>OK</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {projects.length > 0 ? (
                <View style={styles.folderList}>
                  <TouchableOpacity
                    onPress={() => setSelectedProjectId(null)}
                    style={[
                      styles.folderChip,
                      {
                        backgroundColor: !selectedProjectId ? colors.brandSoft : colors.surface,
                        borderColor: !selectedProjectId ? colors.brandBorder : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: !selectedProjectId ? colors.brand : colors.textMuted,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {en ? "All" : "Все"}
                    </Text>
                  </TouchableOpacity>
                  {projects.map((p) => {
                    const sel = selectedProjectId === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        onPress={() => setSelectedProjectId(sel ? null : p.id)}
                        onLongPress={() => deleteProjectFolder(p.id)}
                        style={[
                          styles.folderChip,
                          {
                            backgroundColor: sel ? colors.brandSoft : colors.surface,
                            borderColor: sel ? colors.brandBorder : colors.border,
                          },
                        ]}
                      >
                        <Folder size={12} color={sel ? colors.brand : colors.textMuted} />
                        <Text
                          numberOfLines={1}
                          style={{
                            color: sel ? colors.brand : colors.text,
                            fontSize: 12,
                            fontWeight: "600",
                            maxWidth: 110,
                          }}
                        >
                          {p.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              {/* Search Chats */}
              <View
                style={[
                  styles.searchBox,
                  { backgroundColor: colors.inputBg, borderColor: colors.border },
                ]}
              >
                <Search size={14} color={colors.textSubtle} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={en ? "Search chats..." : "Поиск по чатам..."}
                  placeholderTextColor={colors.textSubtle}
                  style={[styles.searchInput, { color: colors.text }]}
                />
              </View>

              {/* Recent Chats */}
              <Text style={[styles.sectionTitle, { color: colors.textSubtle }]}>
                {en ? "RECENT CHATS" : "НЕДАВНИЕ ЧАТЫ"}
              </Text>
              {filteredChats.length === 0 ? (
                <Text style={[styles.emptyHint, { color: colors.textSubtle }]}>
                  {en ? "No chats yet" : "Пока нет чатов"}
                </Text>
              ) : (
                <View style={styles.chatList}>
                  {filteredChats.slice(0, 30).map((chat) => {
                    const active = activeTab === "chat" && activeChatId === chat.id;
                    return (
                      <View
                        key={chat.id}
                        style={[
                          styles.chatRow,
                          active && { backgroundColor: colors.surfaceElevated },
                        ]}
                      >
                        <TouchableOpacity
                          onPress={() => selectChat(chat.id)}
                          style={styles.chatRowMain}
                          activeOpacity={0.7}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.chatTitle,
                              {
                                color: active ? colors.text : colors.textMuted,
                                fontWeight: active ? "600" : "400",
                              },
                            ]}
                          >
                            {chat.title}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => deleteChat(chat.id)}
                          hitSlop={8}
                          style={styles.delBtn}
                        >
                          <Trash2 size={14} color={colors.textSubtle} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            {/* Pro Upgrade / Status Banner */}
            <TouchableOpacity
              onPress={() => {
                setDrawerOpen(false);
                setProModalOpen(true);
              }}
              style={[
                styles.proCard,
                {
                  backgroundColor: subscription.isPro ? colors.brandSoft : colors.surface,
                  borderColor: subscription.isPro ? colors.brandBorder : colors.border,
                },
              ]}
              activeOpacity={0.8}
            >
              <View style={[styles.proIconWrap, { backgroundColor: colors.brand }]}>
                <Crown size={15} color={colors.onBrand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.proTitle, { color: colors.text }]}>
                  {subscription.isPro
                    ? `IGseek Pro · ${subscription.daysLeft}d`
                    : en
                    ? "Activate IGseek Pro"
                    : "Активировать IGseek Pro"}
                </Text>
                <Text style={[styles.proSub, { color: colors.textMuted }]} numberOfLines={1}>
                  {subscription.isPro
                    ? en
                      ? "All models & limits unlocked"
                      : "Все лимиты и функции активны"
                    : en
                    ? "Redeem license key"
                    : "Ввести ключ IGSK-XXXX"}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Footer: Memory + Settings + User */}
            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <View style={styles.footerQuickRow}>
                <TouchableOpacity
                  onPress={() => handleNav("memory")}
                  style={[
                    styles.footerPill,
                    {
                      backgroundColor: activeTab === "memory" ? colors.brandSoft : colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Brain size={15} color={activeTab === "memory" ? colors.brand : colors.textMuted} />
                  <Text style={[styles.footerPillText, { color: colors.text }]}>
                    {en ? "Memory" : "Память"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleNav("settings")}
                  style={[
                    styles.footerPill,
                    {
                      backgroundColor: activeTab === "settings" ? colors.brandSoft : colors.surface,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Settings size={15} color={activeTab === "settings" ? colors.brand : colors.textMuted} />
                  <Text style={[styles.footerPillText, { color: colors.text }]}>
                    {en ? "Settings" : "Настройки"}
                  </Text>
                </TouchableOpacity>
              </View>

              {session ? (
                <TouchableOpacity
                  onPress={() => handleNav("settings")}
                  style={styles.accountRow}
                  activeOpacity={0.7}
                >
                  <View style={[styles.avatar, { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder }]}>
                    <Text style={[styles.avatarText, { color: colors.brand }]}>
                      {(session.displayName || session.email || "U").slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.accountName, { color: colors.text }]} numberOfLines={1}>
                      {session.displayName}
                    </Text>
                    <Text style={[styles.accountEmail, { color: colors.textSubtle }]} numberOfLines={1}>
                      {session.isGuest ? (en ? "Guest mode" : "Гостевой режим") : session.email}
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>
          </SafeAreaView>
        </Animated.View>

        <Pressable
          style={[styles.scrim, { backgroundColor: colors.overlay }]}
          onPress={() => setDrawerOpen(false)}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdropRow: {
    flex: 1,
    flexDirection: "row",
  },
  drawer: {
    height: "100%",
    borderRightWidth: 1,
  },
  scrim: {
    flex: 1,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 10,
  },
  newChatLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  navGroup: {
    gap: 3,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  navLabel: {
    fontSize: 14,
    flex: 1,
  },
  miniTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniTagText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  folderInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    gap: 8,
  },
  folderInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 2,
  },
  folderList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  folderChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  chatList: {
    gap: 2,
    paddingBottom: 16,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 9,
    paddingLeft: 10,
    paddingRight: 4,
  },
  chatRowMain: {
    flex: 1,
    paddingVertical: 9,
  },
  chatTitle: {
    fontSize: 13.5,
  },
  delBtn: {
    padding: 7,
  },
  emptyHint: {
    fontSize: 12.5,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  proCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 10,
  },
  proIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  proTitle: {
    fontSize: 13,
    fontWeight: "700",
  },
  proSub: {
    fontSize: 11.5,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 10,
  },
  footerQuickRow: {
    flexDirection: "row",
    gap: 8,
  },
  footerPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  footerPillText: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
    fontWeight: "800",
  },
  accountName: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  accountEmail: {
    fontSize: 11.5,
  },
});
