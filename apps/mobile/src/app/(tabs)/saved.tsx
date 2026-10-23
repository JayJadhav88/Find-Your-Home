import { getSettings, listFavorites, setFavorite, tokens } from "@fyh/shared";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { ListingCard } from "@/components/listing-card";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button, Card, EmptyState, ErrorState, Loading, text } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";
import { TopBanner } from "@/components/site-banners";

const { spacing } = tokens;

export default function SavedScreen() {
  const { viewer, loading: sessionLoading } = useSession();
  const { data, error, loading, reload } = useResource(async () => {
    if (!viewer) return null;
    const [favorites, settings] = await Promise.all([listFavorites(supabase, viewer.id), getSettings(supabase)]);
    return { favorites, locale: settings.default_locale };
  }, [viewer?.id]);

  // Saved homes may change on the listing screen; refresh when returning to this tab.
  useFocusEffect(
    useCallback(() => {
      if (viewer) void reload();
    }, [viewer, reload]),
  );

  if (sessionLoading) return <Loading />;
  if (!viewer) return <SignInPrompt title="Save homes you like" message="Sign in to keep a list of homes and see them on any device." />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const rows = data.favorites.flatMap((row) => (row.listing ? [row.listing] : []));
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
      ListHeaderComponent={<TopBanner />}
      ListEmptyComponent={<EmptyState title="No saved homes yet" message="Tap “Save” on any property to keep it here." />}
      renderItem={({ item }) => {
        if (item.status !== "published") {
          return (
            <Card style={{ gap: spacing.sm }}>
              <Text style={text.body}>{item.title}</Text>
              <Text style={text.muted}>This home is no longer available.</Text>
              <Button
                label="Remove from saved"
                variant="secondary"
                onPress={async () => {
                  await setFavorite(supabase, viewer.id, item.id, false);
                  await reload();
                }}
              />
            </Card>
          );
        }
        const cover = [...item.media].filter((m) => m.public_key).sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)[0];
        return (
          <ListingCard
            locale={data.locale}
            listing={{
              ...item,
              city_name: item.city?.name ?? null,
              locality_name: null,
              cover_key: cover?.public_key ?? null,
              cover_alt: cover?.alt_text ?? null,
            }}
          />
        );
      }}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
    />
  );
}
