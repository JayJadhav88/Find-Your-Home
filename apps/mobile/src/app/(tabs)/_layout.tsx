import { tokens } from "@fyh/shared";
import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
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
      <Tabs.Screen name="index" options={{ title: "Explore", tabBarIcon: icon("⌂") }} />
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
