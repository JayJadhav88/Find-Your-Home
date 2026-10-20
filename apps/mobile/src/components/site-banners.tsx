import { getAppBanners, getFloatingAction, tokens } from "@fyh/shared";
import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { openSiteLink } from "@/lib/site-links";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";

const { colors, spacing, fontSize } = tokens;

/** Home banners for the app (set in Admin → Site content). Swipe sideways for more. */
export function SiteBanners() {
  const { data } = useResource(() => getAppBanners(supabase), []);
  if (!data?.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} accessibilityLabel="Offers and announcements">
      {data.map((banner) => (
        <Pressable
          key={banner.id}
          accessibilityRole={banner.target_url ? "link" : "text"}
          accessibilityLabel={[banner.title, banner.subtitle].filter(Boolean).join(". ")}
          disabled={!banner.target_url}
          onPress={() => openSiteLink(`banner:${banner.id}`)}
          style={({ pressed }) => [styles.banner, pressed && { opacity: 0.8 }]}
        >
          {banner.image_url ? <Image source={{ uri: banner.image_url }} style={styles.image} contentFit="cover" accessible={false} /> : null}
          <View style={{ padding: spacing.md, gap: spacing.xs }}>
            <Text style={styles.title}>{banner.title}</Text>
            {banner.subtitle ? <Text style={styles.subtitle}>{banner.subtitle}</Text> : null}
            {banner.target_url ? <Text style={styles.cta}>{banner.cta_label || "Learn more"} ›</Text> : null}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const ICON: Record<string, string> = { whatsapp: "💬", phone: "📞", chat: "💬", calendar: "📅", home: "🏠", offer: "🏷️", video: "🎥" };

/** The admin-configured floating button, e.g. "Chat on WhatsApp". */
export function FloatingButton() {
  const { data } = useResource(() => getFloatingAction(supabase), []);
  if (!data) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={data.label}
      onPress={() => openSiteLink("floating")}
      style={({ pressed }) => [styles.fab, data.position === "left" ? { left: spacing.md } : { right: spacing.md }, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.fabText}>
        {ICON[data.icon] ?? "💬"} {data.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { width: 280, borderRadius: 14, overflow: "hidden", backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.border },
  image: { width: "100%", height: 110 },
  title: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted },
  cta: { fontSize: fontSize.sm, fontWeight: "700", color: colors.brand },
  fab: {
    position: "absolute",
    bottom: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: 24,
    justifyContent: "center",
    backgroundColor: colors.brand,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: fontSize.md },
});
