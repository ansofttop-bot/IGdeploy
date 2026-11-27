import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const IGSEEK_WEB_URL = "https://i-gdeploy-luan.vercel.app";

const MOBILE_USER_AGENT =
  Platform.OS === "ios"
    ? "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
    : "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

// Syncs Web dark/light theme back to native SafeArea & StatusBar
const THEME_SYNC_JS = `
(function() {
  function sendTheme() {
    try {
      var dark = document.documentElement.classList.contains('dark');
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'theme', dark: dark }));
    } catch (e) {}
  }
  sendTheme();
  try {
    new MutationObserver(sendTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  } catch (e) {}
  true;
})();
`;

function isInternalHost(url: string): boolean {
  if (!url || url.startsWith("about:") || url.startsWith("data:") || url.startsWith("blob:")) {
    return true;
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.endsWith("vercel.app") ||
      host.endsWith("igseek.ai") ||
      host.endsWith("firebaseapp.com") ||
      host.endsWith("google.com") ||
      host.endsWith("googleapis.com") ||
      host.endsWith("gstatic.com") ||
      host.endsWith("googleusercontent.com") ||
      host.endsWith("pollinations.ai")
    );
  } catch {
    return true;
  }
}

function IGseekWebShell() {
  const webRef = useRef<WebView>(null);
  const [isDark, setIsDark] = useState(true);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  // Safety timeout so loader never gets stuck
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 6000);
    return () => clearTimeout(t);
  }, []);

  // Android hardware back button navigates inside WebView
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack && webRef.current) {
        webRef.current.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg && msg.type === "theme" && typeof msg.dark === "boolean") {
        setIsDark(msg.dark);
      }
    } catch {
      // Ignore non-JSON messages
    }
  }, []);

  const handleReload = useCallback(() => {
    setHasError(false);
    setLoading(true);
    webRef.current?.reload();
  }, []);

  const bgColor = isDark ? "#0B0A0A" : "#FCFBFA";
  const textColor = isDark ? "#F5F4F4" : "#141414";
  const mutedColor = isDark ? "#979392" : "#666463";
  const brandColor = isDark ? "#EF4444" : "#18181B";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: bgColor }]} edges={["top", "bottom"]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bgColor}
      />

      {hasError ? (
        <View style={[styles.center, { backgroundColor: bgColor }]}>
          <Text style={[styles.title, { color: textColor }]}>Нет соединения с IGseek</Text>
          <Text style={[styles.sub, { color: mutedColor }]}>
            Проверьте интернет и попробуйте снова.
          </Text>
          <TouchableOpacity
            onPress={handleReload}
            style={[styles.retryBtn, { backgroundColor: brandColor }]}
            activeOpacity={0.85}
          >
            <Text style={styles.retryText}>Обновить</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.webWrap}>
          <WebView
            ref={webRef}
            source={{ uri: IGSEEK_WEB_URL }}
            style={[styles.web, { backgroundColor: bgColor }]}
            userAgent={MOBILE_USER_AGENT}
            injectedJavaScript={THEME_SYNC_JS}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            allowsInlineMediaPlayback
            allowsBackForwardNavigationGestures
            javaScriptCanOpenWindowsAutomatically
            setSupportMultipleWindows={false}
            pullToRefreshEnabled
            bounces={false}
            startInLoadingState={false}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setHasError(true);
            }}
            onNavigationStateChange={(nav) => setCanGoBack(Boolean(nav.canGoBack))}
            onShouldStartLoadWithRequest={(req) => {
              if (isInternalHost(req.url)) return true;
              Linking.openURL(req.url).catch(() => undefined);
              return false;
            }}
          />

          {loading ? (
            <View pointerEvents="none" style={[styles.loaderOverlay, { backgroundColor: bgColor }]}>
              <ActivityIndicator size="large" color={brandColor} />
              <Text style={[styles.loaderText, { color: mutedColor }]}>Загрузка IGseek…</Text>
            </View>
          ) : null}
        </View>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <IGseekWebShell />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  webWrap: {
    flex: 1,
  },
  web: {
    flex: 1,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loaderText: {
    fontSize: 14,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  sub: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 8,
  },
  retryBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "700",
  },
});
