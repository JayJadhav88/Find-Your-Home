"use client";

import { videoWatchUrl, type VideoProvider } from "@fyh/shared";
import { useActionState } from "react";
import { removeQuickVideoLink } from "@/app/actions/quick-listing";
import { initialFormState } from "@/app/actions/types";

/** YouTube / Instagram links already added to the property, with a Remove button. */
export function QuickVideoList({
  listingId,
  videos,
  editable,
}: {
  listingId: string;
  videos: Array<{ provider: VideoProvider; video_id: string; instagram_kind: string | null; sort_order: number }>;
  editable: boolean;
}) {
  const [state, action, pending] = useActionState(removeQuickVideoLink, initialFormState);
  if (!videos.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <ul className="flex flex-col gap-2">
        {[...videos]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((video) => (
            <li key={`${video.provider}:${video.video_id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="font-medium">{video.provider === "youtube" ? "YouTube" : "Instagram"}</span>
              <a href={videoWatchUrl(video)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-brand underline">
                {videoWatchUrl(video)}
              </a>
              {editable ? (
                <form action={action}>
                  <input type="hidden" name="listingId" value={listingId} />
                  <input type="hidden" name="videoId" value={video.video_id} />
                  <button type="submit" disabled={pending} className="text-danger underline">
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          ))}
      </ul>
    </div>
  );
}
