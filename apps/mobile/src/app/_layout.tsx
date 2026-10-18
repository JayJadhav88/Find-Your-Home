import { tokens } from "@fyh/shared";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PushBridge } from "@/components/push-bridge";
import { InboxProvider } from "@/lib/notifications";
import { SessionProvider } from "@/lib/session";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <InboxProvider>
        <StatusBar style="dark" />
        <PushBridge />
        <Stack
          screenOptions={{
            headerTintColor: tokens.colors.brand,
            headerTitleStyle: { color: tokens.colors.text },
            contentStyle: { backgroundColor: tokens.colors.surfaceMuted },
            headerTransparent: false,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="listing/[reference]" options={{ title: "Property" }} />
          <Stack.Screen name="sign-in" options={{ title: "Sign in", presentation: "modal" }} />
          <Stack.Screen name="sign-up" options={{ title: "Create an account", presentation: "modal" }} />
          <Stack.Screen name="forgot-password" options={{ title: "Reset password", presentation: "modal" }} />
          <Stack.Screen name="editor/[id]" options={{ title: "Listing" }} />
          <Stack.Screen name="enquiries/index" options={{ title: "Enquiries" }} />
          <Stack.Screen name="enquiries/[id]" options={{ title: "Enquiry" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="notification-settings" options={{ title: "Notification settings" }} />
        </Stack>
        </InboxProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
