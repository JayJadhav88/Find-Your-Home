// Phone notifications through the Expo push service.
//
// Needs a development or store build with an EAS project id (EAS_PROJECT_ID). Expo Go on
// Android cannot receive push notifications, so registration reports why it is unavailable
// instead of failing.
import { registerPushToken, unregisterPushToken } from "@fyh/shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

const TOKEN_KEY = "fyh.push-token";

export type PushSetup =
  | { ok: true }
  | { ok: false; reason: "not_device" | "denied" | "no_project" | "expo_go" | "failed"; message: string };

// Show notifications that arrive while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

async function ensureAndroidChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Updates",
      // eslint-disable-next-line import/namespace -- re-exported through a nested `export *` the lint rule can't follow
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

/**
 * Registers this phone for the signed-in account. With `ask`, shows the system permission
 * prompt if needed; without it, only registers when permission was already given.
 */
export async function setUpPush({ ask }: { ask: boolean }): Promise<PushSetup> {
  if (!Device.isDevice) return { ok: false, reason: "not_device", message: "Phone notifications need a real phone." };
  if (Constants.executionEnvironment === "storeClient" && Platform.OS === "android") {
    return { ok: false, reason: "expo_go", message: "Expo Go can't receive notifications on Android. They work in the installed app." };
  }
  const id = projectId();
  if (!id) return { ok: false, reason: "no_project", message: "Phone notifications are not set up for this build yet." };

  await ensureAndroidChannel();
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && ask) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") {
    return { ok: false, reason: "denied", message: "Notifications are turned off for this app in your phone settings." };
  }

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    await registerPushToken(supabase, token, Platform.OS === "ios" ? "ios" : "android");
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed", message: "Could not turn on notifications. Check your connection and try again." };
  }
}

/** Stops notifications for the current account on this phone (call before signing out). */
export async function forgetThisPhone(): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  if (!token) return;
  await unregisterPushToken(supabase, token).catch(() => {});
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}

export const pushSupported = true;
