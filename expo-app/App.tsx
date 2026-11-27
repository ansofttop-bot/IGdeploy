import { StatusBar } from "expo-status-bar";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ProModal } from "./src/components/ProModal";
import { SidebarDrawer } from "./src/components/SidebarDrawer";
import { AuthScreen } from "./src/screens/AuthScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { EngineScreen } from "./src/screens/EngineScreen";
import { FlowScreen } from "./src/screens/FlowScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { MemoryScreen } from "./src/screens/MemoryScreen";
import { SavedScreen } from "./src/screens/SavedScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { DocsScreen, WaveScreen } from "./src/screens/WaveDocsScreens";
import { AppProvider, useApp } from "./src/state/AppContext";

const MainRouter: React.FC = () => {
  const { ready, session, colors, activeTab, toast } = useApp();

  if (!ready) {
    return (
      <View style={[styles.loader, { backgroundColor: colors.bg }]}>
        <StatusBar style={colors.isDark ? "light" : "dark"} />
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar style={colors.isDark ? "light" : "dark"} />
        <AuthScreen />
      </>
    );
  }

  const renderScreen = () => {
    switch (activeTab) {
      case "flow":
        return <FlowScreen />;
      case "library":
        return <LibraryScreen />;
      case "saved":
        return <SavedScreen />;
      case "engine":
        return <EngineScreen />;
      case "wave":
        return <WaveScreen />;
      case "docs":
        return <DocsScreen />;
      case "memory":
        return <MemoryScreen />;
      case "settings":
        return <SettingsScreen />;
      case "chat":
      default:
        return <ChatScreen />;
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <StatusBar style={colors.isDark ? "light" : "dark"} />
      <View style={{ flex: 1 }}>{renderScreen()}</View>
      <SidebarDrawer />
      <ProModal />
      {toast ? (
        <View
          pointerEvents="none"
          style={[
            styles.toast,
            { backgroundColor: colors.card, borderColor: colors.brandBorder },
          ]}
        >
          <Text style={[styles.toastText, { color: colors.text }]}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <MainRouter />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  safe: {
    flex: 1,
  },
  toast: {
    position: "absolute",
    top: 62,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  toastText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
