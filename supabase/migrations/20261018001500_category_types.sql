-- New enum values must be committed before use, so they live in their own migration.

-- Verified builders list new projects. Granted by an administrator.
alter type public.app_role add value if not exists 'builder';

-- Rental, resale (second-hand sale) and new projects listed by builders.
create type public.listing_category as enum ('rental', 'resale', 'new_project');

create type public.video_provider as enum ('youtube', 'instagram');
