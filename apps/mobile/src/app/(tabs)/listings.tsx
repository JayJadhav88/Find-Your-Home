import { becomeOwner, getSettings, myListings, tokens, viewerCanList } from "@fyh/shared";
import { Link, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Badge, Button, EmptyState, ErrorState, Loading, Notice, text } from "@/components/ui";
import { CATEGORY_BADGE, STATUS_LABEL, STATUS_TONE } from "@/lib/format";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";

const { colors, spacing } = tokens;

export default function MyListingsScreen() {
  const router = useRouter();
  const { viewer, loading: sessionLoading, refresh } = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);
  const { data, error, loading, reload } = useResource(async () => {
    if (!viewer || !viewerCanList(viewer)) return { listings: [], selfService: (await getSettings(supabase)).self_service_owner };
    return { listings: await myListings(supabase, viewer.id), selfService: true };
  }, [viewer?.id, viewer?.roles.join(",")]);

  useFocusEffect(
    useCallback(() => {
      if (viewer) void reload();
    }, [viewer, reload]),
  );

  if (sessionLoading) return <Loading />;
  if (!viewer) return <SignInPrompt title="List a property" message="Sign in to list a property. Every listing is reviewed before it goes live." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  if (!viewerCanList(viewer)) {
    return (
      <View style={{ padding: spacing.md, gap: spacing.md }}>
        <EmptyState
          title="Want to list a property?"
          message={
            !viewer.emailVerified
              ? "Confirm your email address first."
              : data.selfService
                ? "Turn on listing to create listings for rent or resale. Builders listing new projects are verified by our team."
                : "Listing accounts are created by invitation. Contact us to get started."
          }
          action={
            viewer.emailVerified && data.selfService ? (
              <Button
                label="Start listing properties"
                loading={enabling}
                onPress={async () => {
                  setEnabling(true);
                  try {
                    await becomeOwner(supabase);
                    await refresh();
                  } catch (failure) {
                    setNotice(failure instanceof Error ? failure.message : "Could not enable listing.");
                  } finally {
                    setEnabling(false);
                  }
                }}
              />
            ) : undefined
          }
        />
        {notice ? <Notice tone="danger">{notice}</Notice> : null}
      </View>
    );
  }

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={data.listings}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: spacing.md }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
      ListHeaderComponent={
        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Button label="New listing" onPress={() => router.push({ pathname: "/editor/[id]", params: { id: "new" } })} />
          <Button label="Enquiries" variant="secondary" onPress={() => router.push("/enquiries")} />
        </View>
      }
      ListEmptyComponent={<EmptyState title="No listings yet" message="Listings are reviewed by our team before they appear in search." />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      renderItem={({ item }) => (
        <Link href={{ pathname: "/editor/[id]", params: { id: item.id } }} asChild>
          <Pressable accessibilityRole="link" style={styles.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={text.body} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={text.muted}>
                {item.reference_code} · {CATEGORY_BADGE[item.category]}
              </Text>
            </View>
            <Badge label={STATUS_LABEL[item.status] ?? item.status} tone={STATUS_TONE[item.status] ?? "muted"} />
          </Pressable>
        </Link>
      )}
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
