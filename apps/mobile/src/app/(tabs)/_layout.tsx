import { tokens } from "@fyh/shared";
import { Image } from "expo-image";
import { Tabs } from "expo-router";
import { Text, View, type ColorValue } from "react-native";
import { useInbox } from "@/lib/notifications";

// Simple text glyphs keep the app free of icon-font dependencies.
const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return (
      <Text style={{ color, fontSize: 18 }} accessibilityElementsHidden importantForAccessibility="no">
        {glyph}
      </Text>
    );
  };

/** The Find Your Home logo in place of the "Explore" title. */
function LogoTitle() {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Find Your Home" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Image source={require("../../../assets/brand/logo-icon.png")} style={{ width: 38, height: 30 }} contentFit="contain" accessible={false} />
      <Image source={require("../../../assets/brand/logo-wordmark.png")} style={{ width: 128, height: 16 }} contentFit="contain" accessible={false} />
    </View>
  );
}

export default function TabsLayout() {
  const { unread } = useInbox();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tokens.colors.brand,
        tabBarInactiveTintColor: tokens.colors.textMuted,
        headerTitleStyle: { color: tokens.colors.text },
        sceneStyle: { backgroundColor: tokens.colors.surfaceMuted },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Explore", headerTitle: () => <LogoTitle />, tabBarIcon: icon("⌂") }} />
      <Tabs.Screen name="saved" options={{ title: "Saved", tabBarIcon: icon("♡") }} />
      <Tabs.Screen name="listings" options={{ title: "My listings", tabBarIcon: icon("＋") }} />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: icon("☺"),
          tabBarBadge: unread ? (unread > 99 ? "99+" : unread) : undefined,
          tabBarAccessibilityLabel: unread ? `Account, ${unread} unread notifications` : "Account",
        }}
      />
    </Tabs>
  );
}
