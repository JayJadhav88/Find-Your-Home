import { describeNotification, markNotificationsRead } from "@fyh/shared";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { openNotificationTarget } from "@/lib/notification-targets";
import { useInbox } from "@/lib/notifications";
import { setUpPush } from "@/lib/push";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

interface PushData {
  kind?: string;
  data?: Record<string, unknown>;
  notificationId?: number;
}

/**
 * Keeps this phone registered for the signed-in account (when permission was already given),
 * refreshes the unread badge when a notification arrives, and opens the right screen when one
 * is tapped — also when the tap started the app.
 */
export function PushBridge() {
  const router = useRouter();
  const { viewer } = useSession();
  const { refreshUnread } = useInbox();
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  const userId = viewer?.id ?? null;

  useEffect(() => {
    if (userId) void setUpPush({ ask: false });
  }, [userId]);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => refreshUnread());
    return () => subscription.remove();
  }, [refreshUnread]);

  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;

    const content = (response.notification.request.content.data ?? {}) as PushData;
    if (typeof content.notificationId === "number") {
      markNotificationsRead(supabase, [content.notificationId]).then(refreshUnread, () => {});
    }
    openNotificationTarget(router, describeNotification(content.kind ?? "", content.data ?? {}).target);
  }, [response, router, refreshUnread]);

  return null;
}
