// YouTube / Instagram video links. Only the provider's video id is stored; embed URLs are
// rebuilt from it, so user-supplied HTML or arbitrary URLs never reach the page.

export const VIDEO_PROVIDERS = ["youtube", "instagram"] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

export interface ParsedVideo {
  provider: VideoProvider;
  videoId: string;
  /** Instagram post type: p (post), reel or tv. */
  instagramKind: "p" | "reel" | "tv" | null;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "m.instagram.com"]);
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,64}$/;

export function parseVideoUrl(input: string): ParsedVideo | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (YOUTUBE_HOSTS.has(host)) {
    let id: string | null | undefined;
    if (host === "youtu.be") id = parts[0];
    else if (parts[0] === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) id = parts[1];
    return id && YOUTUBE_ID.test(id) ? { provider: "youtube", videoId: id, instagramKind: null } : null;
  }

  if (INSTAGRAM_HOSTS.has(host)) {
    const kindPart = parts[0] === "reels" ? "reel" : parts[0];
    const code = parts[1];
    if ((kindPart === "p" || kindPart === "reel" || kindPart === "tv") && code && INSTAGRAM_CODE.test(code)) {
      return { provider: "instagram", videoId: code, instagramKind: kindPart };
    }
  }
  return null;
}

/** Embed URL rebuilt from the stored id (privacy-enhanced YouTube domain). */
export function videoEmbedUrl(video: { provider: VideoProvider; video_id: string; instagram_kind: string | null }): string {
  if (video.provider === "youtube") {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.video_id)}?autoplay=1&rel=0`;
  }
  return `https://www.instagram.com/${video.instagram_kind ?? "p"}/${encodeURIComponent(video.video_id)}/embed`;
}

/** Link to watch on the provider's own site. */
export function videoWatchUrl(video: { provider: VideoProvider; video_id: string; instagram_kind: string | null }): string {
  if (video.provider === "youtube") return `https://www.youtube.com/watch?v=${encodeURIComponent(video.video_id)}`;
  return `https://www.instagram.com/${video.instagram_kind ?? "p"}/${encodeURIComponent(video.video_id)}/`;
}

/** Splits a textarea / spreadsheet cell into individual links. */
export function splitLinks(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[\s,;|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
