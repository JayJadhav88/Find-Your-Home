import { tokens, videoEmbedUrl, videoWatchUrl, type VideoProvider } from "@fyh/shared";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

const { colors, spacing, radius, fontSize } = tokens;
const LABEL: Record<VideoProvider, string> = { youtube: "YouTube", instagram: "Instagram" };

export interface VideoItem {
  provider: VideoProvider;
  video_id: string;
  instagram_kind: string | null;
}

/**
 * Click-to-load player: nothing is fetched from YouTube/Instagram until the user taps play.
 * The embed URL is rebuilt from the stored id; the web view may not navigate elsewhere.
 */
export function VideoPlayer({ video, label }: { video: VideoItem; label: string }) {
  const [playing, setPlaying] = useState(false);
  const embed = videoEmbedUrl(video);
  const embedOrigin = new URL(embed).origin;

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={[styles.frame, video.provider === "instagram" ? { aspectRatio: 4 / 5 } : null]}>
        {playing ? (
          <WebView
            source={{ uri: embed }}
            style={StyleSheet.absoluteFill}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            originWhitelist={[embedOrigin]}
            onShouldStartLoadWithRequest={(request) => {
              // Keep the player inside the embed; open anything else in the browser.
              if (request.url.startsWith(embedOrigin) || request.url === "about:blank") return true;
              void WebBrowser.openBrowserAsync(request.url);
              return false;
            }}
            accessibilityLabel={label}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play ${LABEL[video.provider]} video: ${label}`}
            onPress={() => setPlaying(true)}
            style={styles.poster}
          >
            <View style={styles.play}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
            <Text style={styles.posterText}>Play {LABEL[video.provider]} video</Text>
            <Text style={styles.posterHint}>Loads content from {LABEL[video.provider]}, which may set cookies.</Text>
          </Pressable>
        )}
      </View>
      <Pressable accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(videoWatchUrl(video))} hitSlop={8}>
        <Text style={styles.link}>Open on {LABEL[video.provider]}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.text },
  poster: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandStrong, padding: spacing.md },
  play: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  playIcon: { fontSize: 24, color: colors.brandStrong, marginLeft: 4 },
  posterText: { color: colors.surface, fontWeight: "700", fontSize: fontSize.md },
  posterHint: { color: "rgba(255,255,255,0.8)", fontSize: fontSize.xs, textAlign: "center" },
  link: { color: colors.brand, textDecorationLine: "underline", fontSize: fontSize.sm },
});
