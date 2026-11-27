import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowUp,
  Bookmark,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Menu,
  Paperclip,
  Plus,
  RefreshCw,
  Share2,
  Square,
  SquarePen,
  X,
} from "../components/Icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { IGseekFoxLogo } from "../components/BrandMark";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { useApp } from "../state/AppContext";
import {
  AGENT_ROLES,
  AI_MODELS,
  ChatAttachment,
  ChatMessageItem,
} from "../types/models";

export const ChatScreen: React.FC = () => {
  const {
    colors,
    prefs,
    updatePrefs,
    setDrawerOpen,
    chats,
    activeChatId,
    activeMessages,
    createNewChat,
    toggleSaveChat,
    toggleBookmarkMessage,
    sendMessage,
    stopStreaming,
    regenerateLast,
    streaming,
    subscription,
    draftPrompt,
    setDraftPrompt,
    addLibraryFile,
    showToast,
  } = useApp();

  const en = prefs.lang === "en";
  const [input, setInput] = useState("");
  const [webSearch, setWebSearch] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatMessageItem>>(null);

  useEffect(() => {
    if (draftPrompt) {
      setInput(draftPrompt);
      setDraftPrompt("");
    }
  }, [draftPrompt, setDraftPrompt]);

  useEffect(() => {
    if (activeMessages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [activeMessages.length, streaming]);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) || null,
    [chats, activeChatId]
  );

  const activeModel = useMemo(
    () => AI_MODELS.find((m) => m.id === prefs.model) || AI_MODELS[0],
    [prefs.model]
  );

  const activeAgent = useMemo(
    () => AGENT_ROLES.find((a) => a.id === prefs.agent) || AGENT_ROLES[0],
    [prefs.agent]
  );

  const starters = useMemo(
    () =>
      en
        ? [
            { title: "Explain a topic", prompt: "Explain how modern AI reasoning models work in simple terms" },
            { title: "Write clean code", prompt: "Write a clean React Native animated bottom sheet component in TypeScript" },
            { title: "Generate art", prompt: "/img neon minimalist red fox in obsidian cyber studio, ultra detailed" },
            { title: "Plan a project", prompt: "Create a 7-day launch plan for a mobile AI productivity app" },
          ]
        : [
            { title: "Объяснить сложное", prompt: "Объясни простыми словами, как устроены современные нейросети с режимом рассуждений" },
            { title: "Написать код", prompt: "Напиши чистый компонент на TypeScript для debounce-поиска с отменой запросов" },
            { title: "Создать арт", prompt: "/img минималистичный неоновый красный лис в тёмной студии, 8k" },
            { title: "Составить план", prompt: "Составь пошаговый план запуска мобильного приложения за 14 дней" },
          ],
    [en]
  );

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text && attachments.length === 0) return;
    setInput("");
    const currentAttachments = attachments;
    setAttachments([]);
    await sendMessage({
      text,
      webSearch,
      reasoning,
      imageMode,
      attachments: currentAttachments,
    });
  };

  const handlePickImage = async () => {
    setAttachMenuOpen(false);
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
      setAttachments((prev) => [
        ...prev,
        {
          id: `att_${Date.now()}`,
          name: asset.fileName || "photo.jpg",
          mimeType: mime,
          dataUrl,
        },
      ]);
    } catch {
      showToast(en ? "Could not open photo library" : "Не удалось открыть галерею");
    }
  };

  const handlePickFile = async () => {
    setAttachMenuOpen(false);
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const mime = asset.mimeType || "application/octet-stream";
      let dataUrl = asset.uri;
      try {
        const blob = await (await fetch(asset.uri)).blob();
        dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () =>
            resolve(typeof reader.result === "string" ? reader.result : asset.uri);
          reader.onerror = () => resolve(asset.uri);
          reader.readAsDataURL(blob);
        });
      } catch {
        dataUrl = asset.uri;
      }
      setAttachments((prev) => [
        ...prev,
        {
          id: `att_${Date.now()}`,
          name: asset.name || "file",
          mimeType: mime,
          dataUrl,
          sizeBytes: asset.size,
        },
      ]);
    } catch {
      showToast(en ? "Could not pick file" : "Не удалось выбрать файл");
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const handleShare = async (text: string) => {
    await Share.share({ message: text }).catch(() => undefined);
  };

  const renderMessage = ({ item, index }: { item: ChatMessageItem; index: number }) => {
    const isUser = item.role === "user";
    const isLast = index === activeMessages.length - 1;

    if (isUser) {
      return (
        <View style={styles.userRow}>
          <View
            style={[
              styles.userBubble,
              {
                backgroundColor: colors.userBubbleBg,
                borderColor: colors.borderStrong,
              },
            ]}
          >
            {item.attachments && item.attachments.length > 0 ? (
              <View style={styles.attChipsRow}>
                {item.attachments.map((att) => (
                  <View key={att.id} style={[styles.attBadge, { backgroundColor: colors.surface }]}>
                    <Paperclip size={11} color={colors.textMuted} />
                    <Text style={[styles.attBadgeText, { color: colors.text }]} numberOfLines={1}>
                      {att.name}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={[styles.userText, { color: colors.userBubbleText }]} selectable>
              {item.content}
            </Text>
          </View>
        </View>
      );
    }

    const showReasoning = Boolean(expandedReasoning[item.id]);
    const isStreamingThis = streaming && isLast;

    return (
      <View style={styles.assistantBlock}>
        <View style={styles.assistantHeader}>
          <View
            style={[
              styles.assistantAvatar,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <IGseekFoxLogo size={15} color={colors.brand} />
          </View>
          <Text style={[styles.assistantName, { color: colors.text }]}>IGseek</Text>
          {isStreamingThis ? (
            <ActivityIndicator size="small" color={colors.brand} style={{ marginLeft: 4 }} />
          ) : null}
        </View>

        {item.reasoning ? (
          <View style={[styles.reasonBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() =>
                setExpandedReasoning((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
              }
              style={styles.reasonHeader}
              activeOpacity={0.7}
            >
              <Brain size={14} color={colors.brand} />
              <Text style={[styles.reasonTitle, { color: colors.textMuted }]}>
                {en ? "Reasoning" : "Рассуждения"}
              </Text>
              {showReasoning ? (
                <ChevronUp size={14} color={colors.textMuted} />
              ) : (
                <ChevronDown size={14} color={colors.textMuted} />
              )}
            </TouchableOpacity>
            {showReasoning ? (
              <Text style={[styles.reasonBody, { color: colors.textMuted }]} selectable>
                {item.reasoning}
              </Text>
            ) : null}
          </View>
        ) : null}

        {item.content ? (
          <MarkdownRenderer content={item.content} colors={colors} lang={prefs.lang} />
        ) : isStreamingThis ? (
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            {en ? "Thinking..." : "Думаю..."}
          </Text>
        ) : null}

        {item.images && item.images.length > 0 ? (
          <View style={styles.imagesWrap}>
            {item.images.map((img) => (
              <View
                key={img.id}
                style={[styles.imageCard, { borderColor: colors.borderStrong, backgroundColor: colors.surface }]}
              >
                <Image
                  source={{ uri: img.dataUrl }}
                  style={styles.generatedImg}
                  resizeMode="cover"
                />
                <View style={styles.imageFooter}>
                  <Text style={[styles.imageTitle, { color: colors.textMuted }]} numberOfLines={1}>
                    {img.title}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      addLibraryFile({
                        name: `${img.title.slice(0, 40) || "image"}.jpg`,
                        type: "image",
                        mimeType: "image/jpeg",
                        sizeBytes: img.dataUrl.length,
                        source: "pollinations",
                        chatTitle: activeChat?.title || "Chat",
                        dataUrl: img.dataUrl,
                        content: null,
                      })
                    }
                    style={[styles.saveImgBtn, { backgroundColor: colors.brandSoft }]}
                  >
                    <Download size={13} color={colors.brand} />
                    <Text style={{ color: colors.brand, fontSize: 12, fontWeight: "700" }}>
                      {en ? "Library" : "В библиотеку"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {item.webSources && item.webSources.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sourcesRow}
          >
            {item.webSources.map((src, sIdx) => (
              <TouchableOpacity
                key={sIdx}
                onPress={() => WebBrowser.openBrowserAsync(src.url).catch(() => undefined)}
                style={[styles.sourceChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Globe size={12} color={colors.brand} />
                <Text style={[styles.sourceTitle, { color: colors.text }]} numberOfLines={1}>
                  {src.title}
                </Text>
                <ExternalLink size={11} color={colors.textSubtle} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        {/* Action row matching IGseek Web / user screenshot */}
        {!isStreamingThis && item.content ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={() => handleCopy(item.id, item.content)}
              style={styles.actionBtn}
            >
              {copiedId === item.id ? (
                <Check size={13} color={colors.success} />
              ) : (
                <Copy size={13} color={colors.textSubtle} />
              )}
              <Text style={[styles.actionLabel, { color: colors.textSubtle }]}>
                {copiedId === item.id
                  ? en
                    ? "Copied"
                    : "Скопировано"
                  : en
                  ? "Copy"
                  : "Копировать"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => activeChatId && toggleBookmarkMessage(activeChatId, item.id)}
              style={styles.actionBtn}
            >
              <Bookmark
                size={13}
                color={item.isBookmarked ? colors.brand : colors.textSubtle}
                fill={item.isBookmarked ? colors.brand : "transparent"}
              />
              <Text
                style={[
                  styles.actionLabel,
                  { color: item.isBookmarked ? colors.brand : colors.textSubtle },
                ]}
              >
                {en ? "Save" : "Сохранить"}
              </Text>
            </TouchableOpacity>

            {isLast ? (
              <TouchableOpacity
                onPress={() => regenerateLast({ webSearch, reasoning })}
                style={styles.actionBtn}
              >
                <RefreshCw size={13} color={colors.textSubtle} />
                <Text style={[styles.actionLabel, { color: colors.textSubtle }]}>
                  {en ? "Retry" : "Ещё раз"}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity onPress={() => handleShare(item.content)} style={styles.actionBtn}>
              <Share2 size={13} color={colors.textSubtle} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* Top Bar matching IGseek Web & Mobile Header */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => setDrawerOpen(true)}
          style={styles.topIconBtn}
          hitSlop={8}
        >
          <Menu size={21} color={colors.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setPickerOpen(true)}
          style={[
            styles.modelPill,
            { backgroundColor: colors.surface, borderColor: colors.borderStrong },
          ]}
          activeOpacity={0.8}
        >
          <IGseekFoxLogo size={16} color={colors.brand} />
          <Text style={[styles.modelPillName, { color: colors.text }]} numberOfLines={1}>
            {activeModel.name}
          </Text>
          <View
            style={[
              styles.planChip,
              {
                backgroundColor: subscription.isPro ? colors.brandSoft : colors.surfaceElevated,
                borderColor: subscription.isPro ? colors.brandBorder : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.planChipText,
                { color: subscription.isPro ? colors.brand : colors.textMuted },
              ]}
            >
              {subscription.isPro ? "Pro" : "Free"}
            </Text>
          </View>
          <ChevronDown size={14} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.topRightRow}>
          <TouchableOpacity
            onPress={() => activeChatId && toggleSaveChat(activeChatId)}
            style={styles.topIconBtn}
            hitSlop={8}
          >
            <Bookmark
              size={19}
              color={activeChat?.isSaved ? colors.brand : colors.textMuted}
              fill={activeChat?.isSaved ? colors.brand : "transparent"}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => createNewChat()}
            style={styles.topIconBtn}
            hitSlop={8}
          >
            <SquarePen size={19} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Active Agent indicator if non-universal */}
      {prefs.agent !== "universal" ? (
        <View style={[styles.agentStrip, { backgroundColor: colors.brandSoft, borderBottomColor: colors.brandBorder }]}>
          <Text style={[styles.agentStripText, { color: colors.brand }]}>
            {en ? `Agent: ${activeAgent.labelEn}` : `Агент: ${activeAgent.labelRu}`}
          </Text>
          <TouchableOpacity onPress={() => updatePrefs({ agent: "universal" })}>
            <X size={14} color={colors.brand} />
          </TouchableOpacity>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {activeMessages.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyWrap}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.emptyLogo,
                { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder },
              ]}
            >
              <IGseekFoxLogo size={38} color={colors.brand} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {en ? "How can I help today?" : "Чем могу помочь?"}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {en
                ? "DeepSeek reasoning, live web search & Pollinations art"
                : "Модели DeepSeek, веб-поиск и генерация фото Pollinations"}
            </Text>

            <View style={styles.starterGrid}>
              {starters.map((s, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => handleSend(s.prompt)}
                  style={[
                    styles.starterCard,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.starterTitle, { color: colors.text }]}>{s.title}</Text>
                  <Text style={[styles.starterPrompt, { color: colors.textMuted }]} numberOfLines={2}>
                    {s.prompt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        ) : (
          <FlatList
            ref={listRef}
            data={activeMessages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Composer Box (Exact IGseek Web rounded dark/light composer) */}
        <View style={styles.composerOuter}>
          {attachments.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.attPreviewRow}
            >
              {attachments.map((att) => (
                <View
                  key={att.id}
                  style={[
                    styles.attPreviewChip,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.borderStrong },
                  ]}
                >
                  <Paperclip size={12} color={colors.brand} />
                  <Text style={[styles.attPreviewName, { color: colors.text }]} numberOfLines={1}>
                    {att.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setAttachments((p) => p.filter((x) => x.id !== att.id))}
                  >
                    <X size={13} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View
            style={[
              styles.composerBox,
              {
                backgroundColor: colors.inputBg,
                borderColor: imageMode ? colors.brandBorder : colors.borderStrong,
              },
            ]}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={
                imageMode
                  ? en
                    ? "Describe the image to generate..."
                    : "Опишите картинку для Pollinations..."
                  : en
                  ? "Ask IGseek anything..."
                  : "Спросите IGseek о чём угодно..."
              }
              placeholderTextColor={colors.textSubtle}
              multiline
              maxLength={8000}
              style={[styles.composerInput, { color: colors.text }]}
            />

            <View style={styles.composerToolbar}>
              <View style={styles.toolGroup}>
                <TouchableOpacity
                  onPress={() => setAttachMenuOpen(true)}
                  style={[styles.circleTool, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                >
                  <Plus size={18} color={colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setWebSearch((v) => !v)}
                  style={[
                    styles.circleTool,
                    {
                      backgroundColor: webSearch ? colors.brandSoft : colors.surfaceElevated,
                      borderColor: webSearch ? colors.brandBorder : colors.border,
                    },
                  ]}
                >
                  <Globe size={16} color={webSearch ? colors.brand : colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setReasoning((v) => !v)}
                  style={[
                    styles.circleTool,
                    {
                      backgroundColor: reasoning ? colors.brandSoft : colors.surfaceElevated,
                      borderColor: reasoning ? colors.brandBorder : colors.border,
                    },
                  ]}
                >
                  <Brain size={16} color={reasoning ? colors.brand : colors.textMuted} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setImageMode((v) => !v)}
                  style={[
                    styles.circleTool,
                    {
                      backgroundColor: imageMode ? colors.brandSoft : colors.surfaceElevated,
                      borderColor: imageMode ? colors.brandBorder : colors.border,
                    },
                  ]}
                >
                  <ImageIcon size={16} color={imageMode ? colors.brand : colors.textMuted} />
                </TouchableOpacity>
              </View>

              {streaming ? (
                <TouchableOpacity
                  onPress={stopStreaming}
                  style={[styles.sendCircle, { backgroundColor: colors.danger }]}
                >
                  <Square size={14} color="#FFFFFF" fill="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => handleSend()}
                  disabled={!input.trim() && attachments.length === 0}
                  style={[
                    styles.sendCircle,
                    {
                      backgroundColor:
                        input.trim() || attachments.length > 0
                          ? colors.brand
                          : colors.surfaceElevated,
                    },
                  ]}
                >
                  <ArrowUp
                    size={18}
                    color={
                      input.trim() || attachments.length > 0
                        ? colors.onBrand
                        : colors.textSubtle
                    }
                    strokeWidth={2.5}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Model & Agent Picker Sheet */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <View style={[styles.sheetOverlay, { backgroundColor: colors.overlay }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setPickerOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {en ? "Model & Agent" : "Модель и агент"}
              </Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              <Text style={[styles.sheetSection, { color: colors.textSubtle }]}>
                {en ? "AI MODELS" : "МОДЕЛИ IGSEEK"}
              </Text>
              {AI_MODELS.map((m) => {
                const sel = prefs.model === m.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() => updatePrefs({ model: m.id })}
                    style={[
                      styles.sheetItem,
                      {
                        backgroundColor: sel ? colors.brandSoft : colors.surface,
                        borderColor: sel ? colors.brandBorder : colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.sheetItemTitle, { color: colors.text }]}>{m.name}</Text>
                      <Text style={[styles.sheetItemSub, { color: colors.textMuted }]}>
                        {en ? m.subtitleEn : m.subtitleRu}
                      </Text>
                    </View>
                    {sel ? <Check size={17} color={colors.brand} /> : null}
                  </TouchableOpacity>
                );
              })}

              <Text style={[styles.sheetSection, { color: colors.textSubtle, marginTop: 14 }]}>
                {en ? "SPECIALIZED AGENTS" : "СПЕЦИАЛИЗИРОВАННЫЕ АГЕНТЫ"}
              </Text>
              <View style={styles.agentsGrid}>
                {AGENT_ROLES.map((a) => {
                  const sel = prefs.agent === a.id;
                  return (
                    <TouchableOpacity
                      key={a.id}
                      onPress={() => {
                        updatePrefs({ agent: a.id });
                        setPickerOpen(false);
                      }}
                      style={[
                        styles.agentCard,
                        {
                          backgroundColor: sel ? colors.brandSoft : colors.surface,
                          borderColor: sel ? colors.brandBorder : colors.border,
                        },
                      ]}
                    >
                      <Text style={[styles.agentCardTitle, { color: sel ? colors.brand : colors.text }]}>
                        {en ? a.labelEn : a.labelRu}
                      </Text>
                      <Text style={[styles.agentCardDesc, { color: colors.textMuted }]} numberOfLines={2}>
                        {en ? a.descEn : a.descRu}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Attachment Picker Sheet */}
      <Modal
        visible={attachMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAttachMenuOpen(false)}
      >
        <View style={[styles.sheetOverlay, { backgroundColor: colors.overlay }]}>
          <Pressable style={{ flex: 1 }} onPress={() => setAttachMenuOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.borderStrong }]}>
            <Text style={[styles.sheetTitle, { color: colors.text, marginBottom: 12 }]}>
              {en ? "Attach to message" : "Прикрепить к сообщению"}
            </Text>
            <TouchableOpacity
              onPress={handlePickImage}
              style={[styles.sheetItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <ImageIcon size={18} color={colors.brand} />
              <Text style={[styles.sheetItemTitle, { color: colors.text }]}>
                {en ? "Photo from gallery" : "Фото из галереи"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handlePickFile}
              style={[styles.sheetItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Paperclip size={18} color={colors.brand} />
              <Text style={[styles.sheetItemTitle, { color: colors.text }]}>
                {en ? "Document / code file" : "Документ или файл кода"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  topIconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  topRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  modelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "62%",
  },
  modelPillName: {
    fontSize: 13.5,
    fontWeight: "700",
    flexShrink: 1,
  },
  planChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  planChipText: {
    fontSize: 10.5,
    fontWeight: "700",
  },
  agentStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  agentStripText: {
    fontSize: 12,
    fontWeight: "700",
  },
  emptyWrap: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  emptyLogo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  emptySub: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 22,
  },
  starterGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  starterCard: {
    width: "48%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
    gap: 5,
  },
  starterTitle: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  starterPrompt: {
    fontSize: 12,
    lineHeight: 16.5,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 18,
  },
  userRow: {
    alignItems: "flex-end",
  },
  userBubble: {
    maxWidth: "84%",
    borderRadius: 20,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 10,
    gap: 6,
  },
  userText: {
    fontSize: 15,
    lineHeight: 21.5,
  },
  attChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  attBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: 180,
  },
  attBadgeText: {
    fontSize: 11.5,
  },
  assistantBlock: {
    gap: 8,
  },
  assistantHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  assistantAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  assistantName: {
    fontSize: 14,
    fontWeight: "700",
  },
  reasonBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  },
  reasonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  reasonTitle: {
    fontSize: 12.5,
    fontWeight: "600",
    flex: 1,
  },
  reasonBody: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  imagesWrap: {
    gap: 10,
    marginTop: 4,
  },
  imageCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  generatedImg: {
    width: "100%",
    aspectRatio: 1,
  },
  imageFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  imageTitle: {
    fontSize: 12,
    flex: 1,
  },
  saveImgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  sourcesRow: {
    gap: 8,
    paddingVertical: 4,
  },
  sourceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 220,
  },
  sourceTitle: {
    fontSize: 12,
    fontWeight: "600",
    flexShrink: 1,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 2,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  composerOuter: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
  },
  attPreviewRow: {
    gap: 8,
    paddingBottom: 8,
  },
  attPreviewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 200,
  },
  attPreviewName: {
    fontSize: 12,
    flexShrink: 1,
  },
  composerBox: {
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
  },
  composerInput: {
    fontSize: 15,
    maxHeight: 120,
    minHeight: 24,
    padding: 0,
  },
  composerToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toolGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  circleTool: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sendCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 18,
    paddingBottom: 28,
    gap: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  sheetSection: {
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 6,
  },
  sheetItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 13,
    borderWidth: 1,
    marginBottom: 8,
  },
  sheetItemTitle: {
    fontSize: 14.5,
    fontWeight: "700",
  },
  sheetItemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  agentsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  agentCard: {
    width: "48%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 11,
    gap: 3,
  },
  agentCardTitle: {
    fontSize: 13.5,
    fontWeight: "700",
  },
  agentCardDesc: {
    fontSize: 11.5,
    lineHeight: 15.5,
  },
});
