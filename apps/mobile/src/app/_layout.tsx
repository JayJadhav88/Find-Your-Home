import { tokens } from "@fyh/shared";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "@/lib/session";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
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
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
