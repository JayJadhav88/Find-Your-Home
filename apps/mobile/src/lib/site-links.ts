import { followSiteLink } from "@fyh/shared";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import { env, supabase } from "./supabase";

/** Opens a banner or floating-button link after counting the click. Destinations come from the database. */
export async function openSiteLink(key: string) {
  const target = await followSiteLink(supabase, key).catch(() => null);
  if (!target) return;
  if (target.startsWith("/")) {
    await WebBrowser.openBrowserAsync(`${env.siteUrl}${target}`);
  } else if (target.startsWith("https://wa.me/") || target.startsWith("tel:")) {
    await Linking.openURL(target);
  } else if (target.startsWith("https://")) {
    await WebBrowser.openBrowserAsync(target);
  }
}
