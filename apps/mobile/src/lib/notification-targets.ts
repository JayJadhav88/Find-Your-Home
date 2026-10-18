import type { NotificationTarget } from "@fyh/shared";
import type { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { env } from "./supabase";

/** Opens the screen (or web page) a notification is about. */
export function openNotificationTarget(router: ReturnType<typeof useRouter>, target: NotificationTarget) {
  switch (target.kind) {
    case "my_listing":
      router.push({ pathname: "/editor/[id]", params: { id: target.id } });
      break;
    case "enquiry":
      router.push({ pathname: "/enquiries/[id]", params: { id: target.id } });
      break;
    case "admin_listing":
      void WebBrowser.openBrowserAsync(`${env.siteUrl}/admin/listings/${target.id}`);
      break;
    case "url":
      void WebBrowser.openBrowserAsync(target.url.startsWith("/") ? `${env.siteUrl}${target.url}` : target.url);
      break;
    default:
      router.push("/notifications");
  }
}
