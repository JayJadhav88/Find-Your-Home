import { becomeOwner, formatDateTime, getSettings, myListings, myListingStats, renewListing, tokens, viewerCanList } from "@fyh/shared";
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
const phoneTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Renewing is offered in the last two weeks before a listing expires. */
function expiresWithinTwoWeeks(expiresAt: string | null): boolean {
  return Boolean(expiresAt) && Date.parse(expiresAt!) < Date.now() + 14 * 86_400_000;
}

export default function MyListingsScreen() {
  const router = useRouter();
  const { viewer, loading: sessionLoading, refresh } = useSession();
  const [notice, setNotice] = useState<string | null>(null);
  const [enabling, setEnabling] = useState(false);
  const { data, error, loading, reload } = useResource(async () => {
    if (!viewer || !viewerCanList(viewer)) {
      return { listings: [], stats: new Map(), selfService: (await getSettings(supabase)).self_service_owner };
    }
    const [listings, stats] = await Promise.all([myListings(supabase, viewer.id), myListingStats(supabase)]);
    return { listings, stats: new Map(stats.map((row) => [row.listing_id, row])), selfService: true };
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
          {notice ? <Notice tone="danger">{notice}</Notice> : null}
        </View>
      }
      ListEmptyComponent={<EmptyState title="No listings yet" message="Listings are reviewed by our team before they appear in search." />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      renderItem={({ item }) => {
        const stat = data.stats.get(item.id);
        const expired = item.status === "archived" && Boolean(item.expired_at);
        const canRenew = expired || expiresWithinTwoWeeks(stat?.expires_at ?? null);
        return (
          <View style={styles.row}>
            <Link href={{ pathname: "/editor/[id]", params: { id: item.id } }} asChild>
              <Pressable accessibilityRole="link" style={{ flex: 1, gap: 2 }}>
                <Text style={text.body} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={text.muted}>
                  {item.reference_code} · {CATEGORY_BADGE[item.category]}
                </Text>
                {stat ? (
                  <Text style={text.muted}>
                    {stat.views_30d} views · {stat.enquiries_30d} enquiries (30 days) · {stat.saves} saved
                    {stat.expires_at ? ` · until ${formatDateTime(stat.expires_at, { locale: "en", timeZone: phoneTimeZone }).split(",")[0]}` : ""}
                  </Text>
                ) : null}
              </Pressable>
            </Link>
            <View style={{ alignItems: "flex-end", gap: spacing.xs }}>
              <Badge label={expired ? "Expired" : (STATUS_LABEL[item.status] ?? item.status)} tone={expired ? "warning" : (STATUS_TONE[item.status] ?? "muted")} />
              {canRenew ? (
                <Button
                  label="Renew"
                  variant="secondary"
                  onPress={async () => {
                    try {
                      await renewListing(supabase, item.id);
                      setNotice(null);
                      void reload();
                    } catch (failure) {
                      setNotice(failure instanceof Error ? failure.message : "Could not renew.");
                    }
                  }}
                />
              ) : null}
            </View>
          </View>
        );
      }}
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
