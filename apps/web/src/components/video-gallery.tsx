"use client";

import { videoEmbedUrl, videoWatchUrl, type VideoProvider } from "@fyh/shared";
import { useState } from "react";

export interface VideoItem {
  provider: VideoProvider;
  video_id: string;
  instagram_kind: string | null;
}

const PROVIDER_LABEL: Record<VideoProvider, string> = { youtube: "YouTube", instagram: "Instagram" };

/**
 * Click-to-load videos: nothing is requested from YouTube or Instagram (no scripts, cookies
 * or thumbnails) until the viewer presses play. Embed URLs are rebuilt from stored ids.
 */
export function VideoGallery({ videos, title }: { videos: VideoItem[]; title: string }) {
  if (!videos.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {videos.map((video, index) => (
        <VideoPlayer key={`${video.provider}-${video.video_id}`} video={video} label={`${title} — video ${index + 1}`} />
      ))}
    </div>
  );
}

function VideoPlayer({ video, label }: { video: VideoItem; label: string }) {
  const [playing, setPlaying] = useState(false);
  const isInstagram = video.provider === "instagram";
  const frameClass = isInstagram ? "aspect-[4/5]" : "aspect-video";

  return (
    <figure className="flex flex-col gap-1">
      <div className={`relative w-full overflow-hidden rounded-xl bg-text ${frameClass}`}>
        {playing ? (
          <iframe
            src={videoEmbedUrl(video)}
            title={label}
            className="absolute inset-0 size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="absolute inset-0 flex size-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-brand-strong to-text text-white"
            aria-label={`Play ${PROVIDER_LABEL[video.provider]} video: ${label}`}
          >
            <span aria-hidden className="flex size-16 items-center justify-center rounded-full bg-white/90 text-2xl text-brand-strong">
              ▶
            </span>
            <span className="text-sm font-semibold">Play {PROVIDER_LABEL[video.provider]} video</span>
            <span className="max-w-[80%] text-xs text-white/80">
              Loads content from {PROVIDER_LABEL[video.provider]}, which may set cookies.
            </span>
          </button>
        )}
      </div>
      <figcaption className="text-xs">
        <a href={videoWatchUrl(video)} target="_blank" rel="noopener noreferrer" className="text-brand underline">
          Open on {PROVIDER_LABEL[video.provider]} (new tab)
        </a>
      </figcaption>
    </figure>
  );
}
