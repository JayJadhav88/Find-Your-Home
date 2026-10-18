import { formatDateTime, getSettings, listEnquiries, tokens } from "@fyh/shared";
import { Link } from "expo-router";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Badge, EmptyState, ErrorState, Loading, text } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";

const { colors, spacing } = tokens;
const STATUS: Record<string, string> = { new: "New", in_progress: "In progress", responded: "Replied", closed: "Closed", spam: "Spam" };

export default function EnquiriesScreen() {
  const { viewer } = useSession();
  const { data, error, loading, reload } = useResource(async () => {
    if (!viewer) return null;
    const [rows, settings] = await Promise.all([listEnquiries(supabase), getSettings(supabase)]);
    return { rows, settings };
  }, [viewer?.id]);

  if (!viewer) return <SignInPrompt title="Enquiries" message="Sign in to see enquiries you sent or received." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  const fmt = { locale: data.settings.default_locale, timeZone: data.settings.default_timezone };
  const sections = [
    { title: "Received about your listings", data: data.rows.filter((row) => row.assigned_to === viewer.id) },
    { title: "Sent by you", data: data.rows.filter((row) => row.sender_user_id === viewer.id) },
  ].filter((section) => section.data.length);

  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      sections={sections}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: spacing.md }}
      renderSectionHeader={({ section }) => <Text style={[text.h2, { marginTop: spacing.md, marginBottom: spacing.sm }]}>{section.title}</Text>}
      ListEmptyComponent={<EmptyState title="No enquiries yet" message="Messages you send or receive about properties appear here." />}
      renderItem={({ item }) => (
        <Link href={{ pathname: "/enquiries/[id]", params: { id: item.id } }} asChild>
          <Pressable accessibilityRole="link" style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={text.body} numberOfLines={1}>
                {item.listing?.title ?? "Listing removed"}
              </Text>
              <Text style={text.muted}>
                {item.kind === "visit_request" ? `Visit ${item.visit_status}` : "Question"} · {formatDateTime(item.created_at, fmt)}
              </Text>
            </View>
            <Badge label={STATUS[item.status] ?? item.status} tone={item.status === "new" ? "warning" : "muted"} />
          </Pressable>
        </Link>
      )}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 56,
  },
});
