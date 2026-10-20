"use client";

import { useEffect, useState } from "react";

export interface BannerItem {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  cta_label: string | null;
  target_url: string | null;
}

/** Rotating home banners. Pauses on hover, focus or the pause button; no motion if the visitor prefers less. */
export function BannerCarousel({ banners }: { banners: BannerItem[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  useEffect(() => {
    if (count < 2 || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), 6000);
    return () => clearInterval(timer);
  }, [count, paused]);

  if (!count) return null;
  const banner = banners[index % count]!;
  const href = banner.target_url ? `/go/${encodeURIComponent(`banner:${banner.id}`)}` : null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Offers and announcements"
      className="mx-auto max-w-6xl px-4 pt-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
    >
      <div className="relative overflow-hidden rounded-2xl border border-border bg-brand-soft">
        <div aria-live={paused ? "polite" : "off"} className="grid min-h-40 items-center gap-4 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-2 p-6">
            <p className="text-xl font-semibold sm:text-2xl">{banner.title}</p>
            {banner.subtitle ? <p className="text-text-muted">{banner.subtitle}</p> : null}
            {href ? (
              <a href={href} className="mt-2 inline-flex min-h-11 w-fit items-center rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-strong">
                {banner.cta_label || "Learn more"}
              </a>
            ) : null}
          </div>
          {banner.image_url ? (
            // Admin-supplied image from the site-media bucket or another https host.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={banner.image_url} alt="" className="hidden h-40 w-72 object-cover sm:block" loading="lazy" />
          ) : null}
        </div>
        {count > 1 ? (
          <div className="flex items-center justify-end gap-2 px-4 pb-3">
            <button type="button" className="min-h-9 rounded-lg px-2 text-sm hover:bg-surface" onClick={() => setIndex((index - 1 + count) % count)} aria-label="Previous banner">
              ‹
            </button>
            <span className="text-xs text-text-muted" aria-hidden>
              {(index % count) + 1} / {count}
            </span>
            <button type="button" className="min-h-9 rounded-lg px-2 text-sm hover:bg-surface" onClick={() => setIndex((index + 1) % count)} aria-label="Next banner">
              ›
            </button>
            <button type="button" className="min-h-9 rounded-lg px-2 text-sm hover:bg-surface" onClick={() => setPaused((value) => !value)} aria-pressed={paused}>
              {paused ? "Play" : "Pause"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
