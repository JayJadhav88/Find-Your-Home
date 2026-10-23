"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";

// Banners set in Admin → Site content. "Top" banners rotate one at a time under the header on
// every visitor page; "offers" banners show side by side (1–3 by screen width) in an offers row.
// Clicks go through /go/<key>, which counts them and only ever opens the saved address.

export interface BannerItem {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  cta_label: string | null;
  target_url: string | null;
}

// No banners where people manage their account or the site.
const NO_BANNERS = ["/admin", "/account", "/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/auth"];

function useBannersAllowedHere() {
  const pathname = usePathname() ?? "/";
  return !NO_BANNERS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const hrefFor = (banner: BannerItem) => (banner.target_url ? `/go/${encodeURIComponent(`banner:${banner.id}`)}` : null);

/** The top banner area in the site layout (hidden on admin, account and sign-in pages). */
export function TopBannerSlot({ banners }: { banners: BannerItem[] }) {
  const allowed = useBannersAllowedHere();
  return allowed ? <TopBanner banners={banners} /> : null;
}

/** The offers row above the footer (the home page shows it mid-page instead). */
export function FooterOffersSlot({ banners }: { banners: BannerItem[] }) {
  const allowed = useBannersAllowedHere();
  const pathname = usePathname();
  if (!allowed || pathname === "/") return null;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-4 pt-10">
      <OffersRow banners={banners} />
    </div>
  );
}

/** One banner at a time, changing every few seconds. Arrows, dots, swipe and pause. */
export function TopBanner({ banners }: { banners: BannerItem[] }) {
  const count = banners.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const touchStart = useRef<number | null>(null);
  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused || hovered || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % count), 5000);
    return () => clearInterval(timer);
  }, [count, paused, hovered]);

  if (!count) return null;
  const onTouchStart = (event: TouchEvent) => (touchStart.current = event.touches[0]?.clientX ?? null);
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStart.current;
    const end = event.changedTouches[0]?.clientX;
    touchStart.current = null;
    if (start === null || end === undefined || Math.abs(end - start) < 40) return;
    go(end < start ? index + 1 : index - 1);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Offers and announcements"
      className="mx-auto w-full max-w-6xl px-4 pt-4"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="relative h-44 overflow-hidden rounded-2xl bg-brand sm:h-64 lg:h-80"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {banners.map((banner, position) => {
          const active = position === index;
          const href = hrefFor(banner);
          const content = (
            <>
              {banner.image_url ? (
                // Admin-supplied image from the site-media bucket or another https host.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={banner.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" loading={position === 0 ? "eager" : "lazy"} />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-r from-brand-strong/85 via-brand-strong/45 to-transparent" />
              <div className="relative flex h-full max-w-xl flex-col justify-center gap-2 px-6 sm:px-10">
                <p className="text-xl font-bold leading-tight text-white sm:text-3xl">{banner.title}</p>
                {banner.subtitle ? <p className="text-sm text-white/90 sm:text-base">{banner.subtitle}</p> : null}
                {href ? (
                  <span className="mt-2 inline-flex min-h-10 w-fit items-center rounded-lg bg-accent px-4 text-sm font-semibold text-brand-strong">
                    {banner.cta_label || "Learn more"} ›
                  </span>
                ) : null}
              </div>
            </>
          );
          return (
            <div
              key={banner.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${position + 1} of ${count}`}
              aria-hidden={!active}
              className={`absolute inset-0 transition-opacity duration-700 ${active ? "opacity-100" : "pointer-events-none opacity-0"}`}
            >
              {href ? (
                <a href={href} tabIndex={active ? 0 : -1} className="block h-full">
                  {content}
                </a>
              ) : (
                content
              )}
            </div>
          );
        })}

        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Previous banner"
              className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl text-brand-strong shadow hover:bg-white"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              aria-label="Next banner"
              className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-xl text-brand-strong shadow hover:bg-white"
            >
              ›
            </button>
            <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-2">
              {banners.map((banner, position) => (
                <button
                  key={banner.id}
                  type="button"
                  onClick={() => go(position)}
                  aria-label={`Show banner ${position + 1}`}
                  aria-current={position === index}
                  className={`h-2.5 rounded-full transition-all ${position === index ? "w-6 bg-accent" : "w-2.5 bg-white/70"}`}
                />
              ))}
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                aria-pressed={paused}
                className="ml-2 rounded-md bg-white/80 px-2 text-xs font-medium text-brand-strong"
              >
                {paused ? "Play" : "Pause"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

/** Offer cards side by side: one on phones, two on tablets, three on computers. */
export function OffersRow({ banners, heading = "Offers" }: { banners: BannerItem[]; heading?: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const updateEdges = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    setEdges({ start: element.scrollLeft <= 4, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [updateEdges, banners.length]);

  if (!banners.length) return null;
  const page = (direction: 1 | -1) => scroller.current?.scrollBy({ left: direction * scroller.current.clientWidth, behavior: "smooth" });

  return (
    <section aria-labelledby="offers-heading" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <h2 id="offers-heading" className="text-2xl font-semibold">
          {heading}
        </h2>
        {!(edges.start && edges.end) ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => page(-1)}
              disabled={edges.start}
              aria-label="Previous offers"
              className="flex size-10 items-center justify-center rounded-full border border-border bg-surface text-xl text-brand disabled:opacity-40"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => page(1)}
              disabled={edges.end}
              aria-label="More offers"
              className="flex size-10 items-center justify-center rounded-full border border-border bg-surface text-xl text-brand disabled:opacity-40"
            >
              ›
            </button>
          </div>
        ) : null}
      </div>
      <div
        ref={scroller}
        onScroll={updateEdges}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((banner) => {
          const href = hrefFor(banner);
          const body = (
            <>
              {banner.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={banner.image_url} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-brand to-brand-strong p-4 text-center text-lg font-bold text-white">
                  {banner.title}
                </div>
              )}
              <div className="flex flex-1 flex-col gap-1 p-4">
                <p className="font-semibold">{banner.title}</p>
                {banner.subtitle ? <p className="text-sm text-text-muted">{banner.subtitle}</p> : null}
                {href ? <span className="mt-auto pt-2 text-sm font-semibold text-brand">{banner.cta_label || "View offer"} ›</span> : null}
              </div>
            </>
          );
          return (
            <div
              key={banner.id}
              className="flex shrink-0 basis-full snap-start overflow-hidden rounded-xl border border-border bg-surface sm:basis-[calc((100%-1rem)/2)] lg:basis-[calc((100%-2rem)/3)]"
            >
              {href ? (
                <a href={href} className="flex w-full flex-col hover:bg-surface-muted">
                  {body}
                </a>
              ) : (
                <div className="flex w-full flex-col">{body}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
