import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

interface FoxLogoProps {
  size?: number;
  color?: string;
}

// Clean geometric IGseek Fox emblem matching Web brand mark
export const IGseekFoxLogo: React.FC<FoxLogoProps> = ({ size = 24, color = "#EF4444" }) => (
  <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <Path
      d="M12 10L25 22H39L52 10L56 30L46 42L32 54L18 42L8 30L12 10Z"
      fill={color}
      fillOpacity={0.14}
      stroke={color}
      strokeWidth={3.2}
      strokeLinejoin="round"
    />
    <Path
      d="M12 10L20 29L32 54L44 29L52 10"
      stroke={color}
      strokeWidth={3.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M21 31L26 34M43 31L38 34M29 44H35L32 48L29 44Z"
      stroke={color}
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

interface WordmarkProps {
  color: string;
  brandColor: string;
  size?: number;
  showBadge?: boolean;
}

export const IGseekWordmark: React.FC<WordmarkProps> = ({
  color,
  brandColor,
  size = 18,
  showBadge = false,
}) => (
  <View style={styles.row}>
    <IGseekFoxLogo size={size + 6} color={brandColor} />
    <Text style={[styles.word, { color, fontSize: size }]}>IGseek</Text>
    {showBadge ? (
      <View style={[styles.badge, { backgroundColor: brandColor }]}>
        <Text style={styles.badgeText}>PRO</Text>
      </View>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  word: {
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
});
