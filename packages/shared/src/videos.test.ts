import { describe, expect, it } from "vitest";
import { parseVideoUrl, splitLinks, videoEmbedUrl } from "./videos";

describe("parseVideoUrl", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("reads YouTube link %s", (url, id) => {
    expect(parseVideoUrl(url)).toEqual({ provider: "youtube", videoId: id, instagramKind: null });
  });

  it.each([
    ["https://www.instagram.com/reel/C1a2B3c4D5e/", "reel"],
    ["https://instagram.com/reels/C1a2B3c4D5e", "reel"],
    ["https://www.instagram.com/p/C1a2B3c4D5e/?igsh=xyz", "p"],
    ["https://www.instagram.com/tv/C1a2B3c4D5e/", "tv"],
  ])("reads Instagram link %s", (url, kind) => {
    expect(parseVideoUrl(url)).toEqual({ provider: "instagram", videoId: "C1a2B3c4D5e", instagramKind: kind });
  });

  it.each([
    "https://vimeo.com/123456",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UC123",
    "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "https://www.instagram.com/someprofile/",
    "not a url",
  ])("rejects %s", (url) => {
    expect(parseVideoUrl(url)).toBeNull();
  });
});

describe("videoEmbedUrl", () => {
  it("rebuilds embeds from ids only", () => {
    expect(videoEmbedUrl({ provider: "youtube", video_id: "dQw4w9WgXcQ", instagram_kind: null })).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0",
    );
    expect(videoEmbedUrl({ provider: "instagram", video_id: "C1a2B3c4D5e", instagram_kind: "reel" })).toBe(
      "https://www.instagram.com/reel/C1a2B3c4D5e/embed",
    );
  });
});

describe("splitLinks", () => {
  it("splits by spaces, commas, semicolons, pipes and new lines", () => {
    expect(splitLinks("https://a.test/1.jpg, https://a.test/2.jpg\nhttps://a.test/3.jpg | https://a.test/4.jpg;")).toEqual([
      "https://a.test/1.jpg",
      "https://a.test/2.jpg",
      "https://a.test/3.jpg",
      "https://a.test/4.jpg",
    ]);
    expect(splitLinks(undefined)).toEqual([]);
  });
});
