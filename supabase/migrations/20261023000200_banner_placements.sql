-- Two banner areas: "top" banners rotate one at a time under the header on every page;
-- "offers" banners show side by side (one to three, depending on screen width) in an offers row.
-- Existing banners become top banners.

alter table public.banners
  add column placement text not null default 'top' check (placement in ('top', 'offers'));

create index banners_placement_order on public.banners (placement, sort_order);
