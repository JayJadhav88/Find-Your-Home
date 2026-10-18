import { tokens, videoEmbedUrl, videoWatchUrl, type VideoProvider } from "@fyh/shared";
import { createElement, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

// Web preview of the app: same click-to-load behaviour with a plain <iframe>
// (react-native-webview does not run on the web).

const { colors, spacing, radius, fontSize } = tokens;
const LABEL: Record<VideoProvider, string> = { youtube: "YouTube", instagram: "Instagram" };

export interface VideoItem {
  provider: VideoProvider;
  video_id: string;
  instagram_kind: string | null;
}

export function VideoPlayer({ video, label }: { video: VideoItem; label: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={[styles.frame, video.provider === "instagram" ? { aspectRatio: 4 / 5 } : null]}>
        {playing ? (
          createElement("iframe", {
            src: videoEmbedUrl(video),
            title: label,
            style: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 },
            allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
            allowFullScreen: true,
            referrerPolicy: "strict-origin-when-cross-origin",
            sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups",
          })
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Play ${LABEL[video.provider]} video: ${label}`} onPress={() => setPlaying(true)} style={styles.poster}>
            <View style={styles.play}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
            <Text style={styles.posterText}>Play {LABEL[video.provider]} video</Text>
            <Text style={styles.posterHint}>Loads content from {LABEL[video.provider]}, which may set cookies.</Text>
          </Pressable>
        )}
      </View>
      <a href={videoWatchUrl(video)} target="_blank" rel="noopener noreferrer" style={{ color: colors.brand, fontSize: fontSize.sm }}>
        Open on {LABEL[video.provider]}
      </a>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: "100%", aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: "hidden", backgroundColor: colors.text, position: "relative" },
  poster: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandStrong, padding: spacing.md },
  play: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" },
  playIcon: { fontSize: 24, color: colors.brandStrong, marginLeft: 4 },
  posterText: { color: colors.surface, fontWeight: "700", fontSize: fontSize.md },
  posterHint: { color: "rgba(255,255,255,0.8)", fontSize: fontSize.xs, textAlign: "center" },
});
