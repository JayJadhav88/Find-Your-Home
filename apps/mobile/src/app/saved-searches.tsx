import { deleteSavedSearch, listSavedSearches, setSavedSearchAlerts, tokens } from "@fyh/shared";
import { useRouter } from "expo-router";
import { Alert, FlatList, RefreshControl, StyleSheet, Switch, Text, View } from "react-native";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button, EmptyState, ErrorState, Loading, text } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";

const { colors, spacing } = tokens;

export default function SavedSearchesScreen() {
  const router = useRouter();
  const { viewer, loading: sessionLoading } = useSession();
  const searches = useResource(() => (viewer ? listSavedSearches(supabase) : Promise.resolve([])), [viewer?.id]);

  if (sessionLoading) return <Loading />;
  if (!viewer) return <SignInPrompt title="Saved searches" message="Sign in to save searches and get alerts for new homes." />;
  if (searches.error) return <ErrorState message={searches.error} onRetry={searches.reload} />;

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      data={searches.data ?? []}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
      refreshControl={<RefreshControl refreshing={searches.loading} onRefresh={searches.reload} tintColor={colors.brand} />}
      ListHeaderComponent={<Text style={text.muted}>We check each search every hour and tell you when new homes match.</Text>}
      ListEmptyComponent={
        searches.loading ? (
          <Loading />
        ) : (
          <EmptyState title="No saved searches yet" message="On Explore, set your filters and tap “Save this search”." />
        )
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={[text.body, { fontWeight: "700" }]}>{item.name}</Text>
          <View style={styles.toggle}>
            <Text style={[text.body, { flex: 1 }]}>Alerts</Text>
            <Switch
              value={item.alerts}
              accessibilityLabel={`Alerts for ${item.name}`}
              trackColor={{ true: colors.brand, false: colors.border }}
              onValueChange={async (alerts) => {
                searches.setData((rows) => rows?.map((row) => (row.id === item.id ? { ...row, alerts } : row)) ?? rows);
                await setSavedSearchAlerts(supabase, item.id, alerts).catch(() => searches.reload());
              }}
            />
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <Button
              label="Open"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: "/", params: { query: item.query_string } })}
            />
            <Button
              label="Delete"
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() =>
                Alert.alert("Delete this saved search?", item.name, [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      await deleteSavedSearch(supabase, item.id).catch(() => {});
                      searches.reload();
                    },
                  },
                ])
              }
            />
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  toggle: { flexDirection: "row", alignItems: "center", minHeight: 44 },
});
