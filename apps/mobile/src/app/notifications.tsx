import {
  describeNotification,
  formatDateTime,
  listNotifications,
  markNotificationsRead,
  tokens,
  type InboxItem,
  type NotificationTarget,
} from "@fyh/shared";
import { Stack, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button, EmptyState, ErrorState, Loading, text } from "@/components/ui";
import { useInbox } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { env, supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";

const { colors, spacing, radius } = tokens;
const phoneTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function NotificationsScreen() {
  const router = useRouter();
  const { viewer, loading: sessionLoading } = useSession();
  const { refreshUnread } = useInbox();
  const inbox = useResource(() => (viewer ? listNotifications(supabase) : Promise.resolve([] as InboxItem[])), [viewer?.id]);

  function open(target: NotificationTarget) {
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
    }
  }

  async function press(item: InboxItem, target: NotificationTarget) {
    if (!item.read_at) {
      inbox.setData((items) => items?.map((row) => (row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row)) ?? items);
      markNotificationsRead(supabase, [item.id]).then(refreshUnread, () => {});
    }
    open(target);
  }

  async function markAll() {
    await markNotificationsRead(supabase).catch(() => {});
    refreshUnread();
    inbox.reload();
  }

  if (sessionLoading) return <Loading />;
  if (!viewer) return <SignInPrompt title="Notifications" message="Sign in to see your notifications." />;
  if (inbox.error) return <ErrorState message={inbox.error} onRetry={inbox.reload} />;

  const items = inbox.data ?? [];
  const unread = items.filter((item) => !item.read_at).length;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: unread ? () => <Button label="Mark all read" variant="ghost" onPress={markAll} /> : undefined,
        }}
      />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
        refreshControl={<RefreshControl refreshing={inbox.loading && items.length > 0} onRefresh={inbox.reload} tintColor={colors.brand} />}
        ListHeaderComponent={
          <Button label="Notification settings" variant="secondary" onPress={() => router.push("/notification-settings")} />
        }
        ListEmptyComponent={
          inbox.loading ? <Loading /> : <EmptyState title="No notifications yet" message="Listing decisions, enquiries and visit updates show up here." />
        }
        renderItem={({ item }) => {
          const note = describeNotification(item.kind, item.data as Record<string, unknown>);
          return (
            <Pressable
              onPress={() => press(item, note.target)}
              accessibilityRole="button"
              accessibilityLabel={`${item.read_at ? "" : "Unread. "}${note.title}. ${note.body}`}
              style={({ pressed }) => [styles.row, !item.read_at && styles.unread, pressed && { opacity: 0.7 }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                {!item.read_at ? <View style={styles.dot} /> : null}
                <Text style={[text.body, { fontWeight: "700", flexShrink: 1 }]}>{note.title}</Text>
              </View>
              {note.body ? <Text style={text.body}>{note.body}</Text> : null}
              <Text style={text.muted}>{formatDateTime(item.created_at, { locale: "en", timeZone: phoneTimeZone })}</Text>
            </Pressable>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unread: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
});
