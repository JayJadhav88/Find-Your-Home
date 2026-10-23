import { getAppBanners, getFloatingAction, tokens } from "@fyh/shared";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { openSiteLink } from "@/lib/site-links";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";

const { colors, spacing, fontSize, radius } = tokens;

type Banner = { id: string; title: string; subtitle: string | null; image_url: string | null; cta_label: string | null; target_url: string | null };

// Banners set in Admin → Site content ("Top banner" or "Offers row"). Taps go through
// openSiteLink, which counts the click and only opens the address the team saved.
const open = (banner: Banner) => (banner.target_url ? openSiteLink(`banner:${banner.id}`) : undefined);

/** Measures the width the component actually has (lists are padded). */
function useWidth() {
  const [width, setWidth] = useState(0);
  return [width, (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width))] as const;
}

/** One banner at a time, changing every few seconds; swipe, arrows and dots. */
export function TopBanner() {
  const { data } = useResource(() => getAppBanners(supabase, "top"), []);
  const banners = (data ?? []) as Banner[];
  const [width, onLayout] = useWidth();
  const [index, setIndex] = useState(0);
  const [touching, setTouching] = useState(false);
  const list = useRef<FlatList<Banner>>(null);
  const count = banners.length;
  const height = Math.max(150, Math.round(width * 0.42));

  const go = (next: number) => {
    if (!count) return;
    const target = ((next % count) + count) % count;
    list.current?.scrollToIndex({ index: target, animated: true });
    setIndex(target);
  };

  useEffect(() => {
    if (count < 2 || touching || !width) return;
    const timer = setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % count;
        list.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [count, touching, width]);

  if (!count) return null;
  return (
    <View onLayout={onLayout} accessibilityLabel="Offers and announcements">
      {width ? (
        <View style={[styles.topFrame, { height }]}>
          <FlatList
            ref={list}
            data={banners}
            keyExtractor={(banner) => banner.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onScrollBeginDrag={() => setTouching(true)}
            onScrollEndDrag={() => setTouching(false)}
            onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => open(item)}
                disabled={!item.target_url}
                accessibilityRole={item.target_url ? "link" : "text"}
                accessibilityLabel={[item.title, item.subtitle].filter(Boolean).join(". ")}
                style={{ width, height }}
              >
                {item.image_url ? (
                  <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
                ) : null}
                <View style={[StyleSheet.absoluteFill, styles.topShade]} />
                <View style={styles.topText}>
                  <Text style={styles.topTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.subtitle ? (
                    <Text style={styles.topSubtitle} numberOfLines={2}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                  {item.target_url ? <Text style={styles.topCta}>{item.cta_label || "Learn more"} ›</Text> : null}
                </View>
              </Pressable>
            )}
          />
          {count > 1 ? (
            <>
              <Pressable onPress={() => go(index - 1)} accessibilityRole="button" accessibilityLabel="Previous banner" style={[styles.arrow, { left: spacing.sm }]} hitSlop={8}>
                <Text style={styles.arrowText}>‹</Text>
              </Pressable>
              <Pressable onPress={() => go(index + 1)} accessibilityRole="button" accessibilityLabel="Next banner" style={[styles.arrow, { right: spacing.sm }]} hitSlop={8}>
                <Text style={styles.arrowText}>›</Text>
              </Pressable>
              <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {banners.map((banner, position) => (
                  <View key={banner.id} style={[styles.dot, position === index ? styles.dotActive : null]} />
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Offer cards side by side: one (with a peek of the next) on phones, two or three on tablets. */
export function OffersRow({ heading = "Offers" }: { heading?: string }) {
  const { data } = useResource(() => getAppBanners(supabase, "offers"), []);
  const banners = (data ?? []) as Banner[];
  const [width, onLayout] = useWidth();
  const list = useRef<FlatList<Banner>>(null);
  const [offset, setOffset] = useState(0);
  if (!banners.length) return null;

  const perView = width >= 900 ? 3 : width >= 600 ? 2 : 1.15;
  const gap = spacing.sm;
  const cardWidth = width ? Math.floor((width - gap * (Math.ceil(perView) - 1)) / perView) : 0;
  const step = cardWidth + gap;
  const page = (direction: 1 | -1) => {
    const next = Math.max(0, offset + direction * step * Math.max(1, Math.floor(perView)));
    list.current?.scrollToOffset({ offset: next, animated: true });
  };

  return (
    <View onLayout={onLayout} style={{ gap: spacing.sm }}>
      <View style={styles.offersHead}>
        <Text style={styles.offersHeading} accessibilityRole="header">
          {heading}
        </Text>
        {banners.length > 1 ? (
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            <Pressable onPress={() => page(-1)} accessibilityRole="button" accessibilityLabel="Previous offers" style={styles.smallArrow} hitSlop={6}>
              <Text style={styles.smallArrowText}>‹</Text>
            </Pressable>
            <Pressable onPress={() => page(1)} accessibilityRole="button" accessibilityLabel="More offers" style={styles.smallArrow} hitSlop={6}>
              <Text style={styles.smallArrowText}>›</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {cardWidth ? (
        <FlatList
          ref={list}
          data={banners}
          keyExtractor={(banner) => banner.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={step}
          decelerationRate="fast"
          onScroll={(event) => setOffset(event.nativeEvent.contentOffset.x)}
          scrollEventThrottle={64}
          ItemSeparatorComponent={() => <View style={{ width: gap }} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item)}
              disabled={!item.target_url}
              accessibilityRole={item.target_url ? "link" : "text"}
              accessibilityLabel={[item.title, item.subtitle].filter(Boolean).join(". ")}
              style={({ pressed }) => [styles.card, { width: cardWidth }, pressed && { opacity: 0.85 }]}
            >
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={{ width: "100%", aspectRatio: 16 / 9 }} contentFit="cover" accessible={false} />
              ) : (
                <View style={[styles.cardPlaceholder, { aspectRatio: 16 / 9 }]}>
                  <Text style={styles.cardPlaceholderText} numberOfLines={3}>
                    {item.title}
                  </Text>
                </View>
              )}
              <View style={{ padding: spacing.md, gap: 2 }}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.subtitle ? (
                  <Text style={styles.cardSubtitle} numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                ) : null}
                {item.target_url ? <Text style={styles.cardCta}>{item.cta_label || "View offer"} ›</Text> : null}
              </View>
            </Pressable>
          )}
        />
      ) : null}
    </View>
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
  topFrame: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.brand },
  topShade: { backgroundColor: "rgba(0, 31, 66, 0.5)" },
  topText: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.xs },
  topTitle: { color: "#fff", fontSize: fontSize.xl, fontWeight: "800" },
  topSubtitle: { color: "rgba(255,255,255,0.92)", fontSize: fontSize.sm },
  topCta: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    backgroundColor: colors.accent,
    color: colors.brandStrong,
    fontWeight: "700",
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  arrow: {
    position: "absolute",
    top: "50%",
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: { fontSize: 22, color: colors.brandStrong, fontWeight: "700", marginTop: -2 },
  dots: { position: "absolute", bottom: spacing.sm, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.7)" },
  dotActive: { width: 20, backgroundColor: colors.accent },
  offersHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  offersHeading: { fontSize: fontSize.lg, fontWeight: "700", color: colors.text },
  smallArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  smallArrowText: { fontSize: 20, color: colors.brand, fontWeight: "700", marginTop: -2 },
  card: { borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cardPlaceholder: { width: "100%", backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", padding: spacing.md },
  cardPlaceholderText: { color: "#fff", fontWeight: "800", fontSize: fontSize.lg, textAlign: "center" },
  cardTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  cardSubtitle: { fontSize: fontSize.sm, color: colors.textMuted },
  cardCta: { marginTop: spacing.xs, fontSize: fontSize.sm, fontWeight: "700", color: colors.brand },
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
