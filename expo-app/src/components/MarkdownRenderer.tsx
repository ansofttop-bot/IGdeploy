import * as Clipboard from "expo-clipboard";
import { Check, Copy } from "./Icons";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AppColors } from "../theme/theme";

interface MarkdownRendererProps {
  content: string;
  colors: AppColors;
  lang?: "ru" | "en";
}

type Block =
  | { type: "code"; language: string; code: string }
  | { type: "heading"; level: number; text: string }
  | { type: "quote"; text: string }
  | { type: "bullet"; text: string }
  | { type: "numbered"; num: string; text: string }
  | { type: "paragraph"; text: string };

function parseMarkdown(raw: string): Block[] {
  const blocks: Block[] = [];
  const lines = (raw || "").split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```([\w.+-]*)\s*$/);
    if (fence) {
      const language = fence[1] || "code";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      blocks.push({ type: "quote", text: trimmed.slice(2) });
      i++;
      continue;
    }

    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      blocks.push({ type: "bullet", text: bullet[1] });
      i++;
      continue;
    }

    const numbered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      blocks.push({ type: "numbered", num: numbered[1], text: numbered[2] });
      i++;
      continue;
    }

    // Collect contiguous paragraph lines
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("```") &&
      !/^#{1,3}\s+/.test(lines[i].trim()) &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("> ")
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", text: para.join("\n") });
  }

  return blocks;
}

function renderInline(text: string, colors: AppColors, baseStyle: any) {
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  const parts = text.split(tokenRegex);
  return (
    <Text style={baseStyle} selectable>
      {parts.map((part, idx) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <Text key={idx} style={{ fontWeight: "700", color: colors.text }}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <Text
              key={idx}
              style={{
                fontFamily: "Courier",
                fontSize: 13,
                backgroundColor: colors.surfaceElevated,
                color: colors.brand,
              }}
            >
              {" "}
              {part.slice(1, -1)}{" "}
            </Text>
          );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return (
            <Text key={idx} style={{ fontStyle: "italic" }}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </Text>
  );
}

const CodeBlockView: React.FC<{
  language: string;
  code: string;
  colors: AppColors;
  lang: "ru" | "en";
}> = ({ language, code, colors, lang }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <View style={[styles.codeWrap, { backgroundColor: colors.codeBg, borderColor: colors.borderStrong }]}>
      <View style={[styles.codeHeader, { backgroundColor: colors.codeHeaderBg, borderBottomColor: colors.border }]}>
        <Text style={styles.codeLang}>{language.toUpperCase()}</Text>
        <TouchableOpacity onPress={handleCopy} style={styles.copyBtn} activeOpacity={0.7}>
          {copied ? (
            <Check size={13} color="#22C55E" />
          ) : (
            <Copy size={13} color="#A1A1AA" />
          )}
          <Text style={[styles.copyLabel, { color: copied ? "#22C55E" : "#A1A1AA" }]}>
            {copied ? (lang === "en" ? "Copied" : "Скопировано") : lang === "en" ? "Copy" : "Копировать"}
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.codeScroll}>
        <Text style={styles.codeText} selectable>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  colors,
  lang = "ru",
}) => {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <View style={styles.root}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "code":
            return (
              <CodeBlockView
                key={idx}
                language={block.language}
                code={block.code}
                colors={colors}
                lang={lang}
              />
            );
          case "heading": {
            const size = block.level === 1 ? 20 : block.level === 2 ? 17 : 15;
            return (
              <Text
                key={idx}
                style={[styles.heading, { color: colors.text, fontSize: size }]}
                selectable
              >
                {block.text}
              </Text>
            );
          }
          case "quote":
            return (
              <View
                key={idx}
                style={[
                  styles.quote,
                  { borderLeftColor: colors.brand, backgroundColor: colors.surface },
                ]}
              >
                {renderInline(block.text, colors, [styles.body, { color: colors.textMuted }])}
              </View>
            );
          case "bullet":
            return (
              <View key={idx} style={styles.listRow}>
                <Text style={[styles.bulletDot, { color: colors.brand }]}>•</Text>
                <View style={styles.listContent}>
                  {renderInline(block.text, colors, [styles.body, { color: colors.text }])}
                </View>
              </View>
            );
          case "numbered":
            return (
              <View key={idx} style={styles.listRow}>
                <Text style={[styles.numLabel, { color: colors.textMuted }]}>{block.num}.</Text>
                <View style={styles.listContent}>
                  {renderInline(block.text, colors, [styles.body, { color: colors.text }])}
                </View>
              </View>
            );
          default:
            return (
              <View key={idx}>
                {renderInline(block.text, colors, [styles.body, { color: colors.text }])}
              </View>
            );
        }
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  body: {
    fontSize: 15,
    lineHeight: 22.5,
  },
  heading: {
    fontWeight: "700",
    marginTop: 4,
    letterSpacing: -0.3,
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingLeft: 2,
  },
  bulletDot: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  numLabel: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "600",
    minWidth: 18,
  },
  listContent: {
    flex: 1,
  },
  codeWrap: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginVertical: 4,
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  codeLang: {
    color: "#A1A1AA",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  copyLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  codeScroll: {
    padding: 12,
  },
  codeText: {
    color: "#E4E4E7",
    fontFamily: "Courier",
    fontSize: 13,
    lineHeight: 19,
  },
});
