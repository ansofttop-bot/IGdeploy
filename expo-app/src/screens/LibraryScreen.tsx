import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import {
  Code2,
  Copy,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Library,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "../state/AppContext";
import { LibraryFileItem } from "../types/models";

export const LibraryScreen: React.FC = () => {
  const {
    colors,
    prefs,
    setDrawerOpen,
    libraryFiles,
    addLibraryFile,
    removeLibraryFile,
    projects,
    createProjectFolder,
    deleteProjectFolder,
    setSelectedProjectId,
    setActiveTab,
    setDraftPrompt,
    showToast,
  } = useApp();

  const en = prefs.lang === "en";
  const [tab, setTab] = useState<"files" | "projects">("files");
  const [filter, setFilter] = useState<"all" | "image" | "code" | "doc">("all");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<LibraryFileItem | null>(null);
  const [newProjName, setNewProjName] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return libraryFiles.filter((f) => {
      if (filter !== "all" && f.type !== filter) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, libraryFiles, query]);

  const handleUploadPhoto = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        base64: true,
        quality: 0.72,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const mime = asset.mimeType || "image/jpeg";
      const dataUrl = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
      addLibraryFile({
        name: asset.fileName || `photo_${Date.now().toString(36)}.jpg`,
        type: "image",
        mimeType: mime,
        sizeBytes: dataUrl.length,
        source: "upload",
        chatTitle: en ? "Library" : "Библиотека",
        dataUrl,
        content: null,
      });
    } catch {
      showToast(en ? "Upload failed" : "Ошибка загрузки");
    }
  };

  const handleUploadDoc = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const text = await FileSystem.readAsStringAsync(asset.uri).catch(() => "");
      const isCode = /\.(ts|tsx|js|jsx|py|kt|swift|html|css|json|sql)$/i.test(asset.name);
      addLibraryFile({
        name: asset.name,
        type: isCode ? "code" : "doc",
        mimeType: asset.mimeType || "text/plain",
        sizeBytes: asset.size || text.length,
        source: "upload",
        chatTitle: en ? "Library" : "Библиотека",
        content: text || `[File: ${asset.name}]`,
        dataUrl: null,
      });
    } catch {
      showToast(en ? "Could not pick file" : "Не удалось выбрать файл");
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.iconBtn}>
          <Menu size={21} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Library size={18} color={colors.brand} />
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {en ? "Library" : "Библиотека"}
          </Text>
        </View>
        <TouchableOpacity onPress={handleUploadPhoto} style={styles.iconBtn}>
          <Upload size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Segmented switch: Files / Projects */}
      <View style={styles.padHeader}>
        <View style={[styles.segWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            onPress={() => setTab("files")}
            style={[styles.segBtn, tab === "files" && { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: tab === "files" ? colors.onBrand : colors.textMuted, fontSize: 13, fontWeight: "700" }}>
              {en ? `Files (${libraryFiles.length})` : `Файлы (${libraryFiles.length})`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab("projects")}
            style={[styles.segBtn, tab === "projects" && { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: tab === "projects" ? colors.onBrand : colors.textMuted, fontSize: 13, fontWeight: "700" }}>
              {en ? `Folders (${projects.length})` : `Папки (${projects.length})`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {tab === "files" ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.uploadRow}>
            <TouchableOpacity
              onPress={handleUploadPhoto}
              style={[styles.uploadBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <ImageIcon size={15} color={colors.brand} />
              <Text style={[styles.uploadLabel, { color: colors.text }]}>
                {en ? "Add photo" : "Добавить фото"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleUploadDoc}
              style={[styles.uploadBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <FileText size={15} color={colors.brand} />
              <Text style={[styles.uploadLabel, { color: colors.text }]}>
                {en ? "Add document" : "Добавить файл"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Search size={15} color={colors.textSubtle} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={en ? "Search library..." : "Поиск в библиотеке..."}
              placeholderTextColor={colors.textSubtle}
              style={[styles.searchInput, { color: colors.text }]}
            />
          </View>

          <View style={styles.filterRow}>
            {(
              [
                { id: "all", label: en ? "All" : "Все" },
                { id: "image", label: en ? "Images" : "Фото" },
                { id: "code", label: en ? "Code" : "Код" },
                { id: "doc", label: en ? "Docs" : "Документы" },
              ] as const
            ).map((f) => {
              const sel = filter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: sel ? colors.brandSoft : colors.surface,
                      borderColor: sel ? colors.brandBorder : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: sel ? colors.brand : colors.textMuted, fontSize: 12, fontWeight: "700" }}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {filtered.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Library size={26} color={colors.textSubtle} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {en ? "Library is empty" : "Библиотека пуста"}
              </Text>
              <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                {en
                  ? "Save generated images, Flow reports, Engine code, or upload files here."
                  : "Сохраняйте фото из чата, отчёты Flow, код из Engine или загружайте свои файлы."}
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {filtered.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setPreview(item)}
                  style={[styles.fileCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  activeOpacity={0.75}
                >
                  {item.dataUrl ? (
                    <Image source={{ uri: item.dataUrl }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumbIcon, { backgroundColor: colors.brandSoft }]}>
                      {item.type === "code" ? (
                        <Code2 size={20} color={colors.brand} />
                      ) : (
                        <FileText size={20} color={colors.brand} />
                      )}
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.fileMeta, { color: colors.textMuted }]} numberOfLines={1}>
                      {item.chatTitle} · {item.type.toUpperCase()}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeLibraryFile(item.id)} hitSlop={8}>
                    <Trash2 size={16} color={colors.textSubtle} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.addProjRow, { backgroundColor: colors.inputBg, borderColor: colors.borderStrong }]}>
            <FolderPlus size={16} color={colors.textMuted} />
            <TextInput
              value={newProjName}
              onChangeText={setNewProjName}
              placeholder={en ? "New folder name..." : "Название новой папки..."}
              placeholderTextColor={colors.textSubtle}
              style={[styles.searchInput, { color: colors.text }]}
              onSubmitEditing={() => {
                if (newProjName.trim()) {
                  createProjectFolder(newProjName.trim());
                  setNewProjName("");
                }
              }}
            />
            <TouchableOpacity
              onPress={() => {
                if (newProjName.trim()) {
                  createProjectFolder(newProjName.trim());
                  setNewProjName("");
                }
              }}
              style={[styles.plusBtn, { backgroundColor: colors.brand }]}
            >
              <Plus size={16} color={colors.onBrand} />
            </TouchableOpacity>
          </View>

          {projects.length === 0 ? (
            <Text style={[styles.emptySub, { color: colors.textMuted, textAlign: "center", marginTop: 20 }]}>
              {en ? "No folders yet" : "Папок пока нет"}
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {projects.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => {
                    setSelectedProjectId(p.id);
                    setActiveTab("chat");
                  }}
                  style={[styles.fileCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={[styles.thumbIcon, { backgroundColor: colors.brandSoft }]}>
                    <Folder size={20} color={colors.brand} />
                  </View>
                  <Text style={[styles.fileName, { color: colors.text, flex: 1 }]}>{p.name}</Text>
                  <TouchableOpacity onPress={() => deleteProjectFolder(p.id)} hitSlop={8}>
                    <Trash2 size={16} color={colors.textSubtle} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* File Preview Modal */}
      <Modal
        visible={Boolean(preview)}
        transparent
        animationType="slide"
        onRequestClose={() => setPreview(null)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setPreview(null)} />
          {preview ? (
            <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
                  {preview.name}
                </Text>
                <TouchableOpacity onPress={() => setPreview(null)}>
                  <X size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 380 }}>
                {preview.dataUrl ? (
                  <Image
                    source={{ uri: preview.dataUrl }}
                    style={{ width: "100%", aspectRatio: 1, borderRadius: 12 }}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={[styles.previewText, { color: colors.text }]} selectable>
                    {preview.content || ""}
                  </Text>
                )}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => {
                    const snippet = preview.content
                      ? `Проанализируй файл "${preview.name}":\n\n${preview.content.slice(0, 2000)}`
                      : `Расскажи об этом файле: ${preview.name}`;
                    setDraftPrompt(snippet);
                    setPreview(null);
                    setActiveTab("chat");
                  }}
                  style={[styles.modalBtn, { backgroundColor: colors.brand }]}
                >
                  <MessageSquare size={15} color={colors.onBrand} />
                  <Text style={{ color: colors.onBrand, fontWeight: "700", fontSize: 13 }}>
                    {en ? "Use in chat" : "В чат"}
                  </Text>
                </TouchableOpacity>

                {preview.content ? (
                  <TouchableOpacity
                    onPress={async () => {
                      await Clipboard.setStringAsync(preview.content || "");
                      showToast(en ? "Copied" : "Скопировано");
                    }}
                    style={[styles.modalBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
                  >
                    <Copy size={15} color={colors.text} />
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>
                      {en ? "Copy" : "Копировать"}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  onPress={() =>
                    Share.share({
                      title: preview.name,
                      message: preview.content || preview.name,
                    }).catch(() => undefined)
                  }
                  style={[styles.modalBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}
                >
                  <Share2 size={15} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
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
  padHeader: { paddingHorizontal: 16, paddingTop: 12 },
  segWrap: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4 },
  segBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  scroll: { padding: 16, gap: 12, paddingBottom: 32 },
  uploadRow: { flexDirection: "row", gap: 10 },
  uploadBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  uploadLabel: { fontSize: 13, fontWeight: "700" },
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
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800" },
  emptySub: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  thumb: { width: 46, height: 46, borderRadius: 10 },
  thumbIcon: {
    width: 46,
    height: 46,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: { fontSize: 14.5, fontWeight: "700" },
  fileMeta: { fontSize: 12, marginTop: 2 },
  addProjRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  plusBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 18,
    paddingBottom: 28,
    gap: 14,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  modalTitle: { fontSize: 16, fontWeight: "800", flex: 1 },
  previewText: { fontSize: 13.5, lineHeight: 20, fontFamily: "Courier" },
  modalActions: { flexDirection: "row", gap: 8 },
  modalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
  },
});
