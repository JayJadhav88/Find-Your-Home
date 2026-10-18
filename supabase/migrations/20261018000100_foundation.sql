-- Foundation: extensions, private helper schema, enumerations, shared trigger functions.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Private schema for helper functions and internal tables. It is NOT exposed through the
-- Data API; roles only get USAGE so RLS policies can call the helper functions.
create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enumerations (mirrored in packages/shared/src/domain.ts)
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('buyer', 'owner', 'agent', 'moderator', 'administrator');
create type public.account_status as enum ('active', 'suspended', 'deletion_requested');
create type public.listing_purpose as enum ('sale', 'rent');
create type public.listing_status as enum (
  'draft', 'pending_review', 'published', 'rejected', 'suspended', 'archived', 'sold', 'rented'
);
create type public.price_period as enum ('total', 'per_month', 'per_year', 'per_week', 'per_day');
create type public.price_display as enum ('show', 'on_request');
create type public.address_visibility as enum ('exact', 'approximate', 'hidden');
create type public.furnishing as enum ('unfurnished', 'semi_furnished', 'furnished');
create type public.possession_status as enum ('ready', 'under_construction', 'available_from_date');
create type public.area_unit as enum ('sq_m', 'sq_ft', 'acre', 'hectare');
create type public.location_level as enum ('country', 'region', 'city', 'locality');
create type public.media_kind as enum ('image', 'document');
create type public.enquiry_kind as enum ('enquiry', 'visit_request');
create type public.enquiry_status as enum ('new', 'in_progress', 'responded', 'closed', 'spam');
create type public.visit_status as enum ('requested', 'confirmed', 'declined', 'cancelled');
create type public.outbox_status as enum ('pending', 'sent', 'failed', 'skipped_not_configured');
create type public.data_request_kind as enum ('export', 'deletion');
create type public.data_request_status as enum ('pending', 'in_progress', 'completed', 'rejected');

-- ---------------------------------------------------------------------------
-- Shared trigger: maintain updated_at
-- ---------------------------------------------------------------------------
create function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- True when the current statement comes straight from a client request (anon or
-- authenticated), as opposed to a SECURITY DEFINER workflow function, the service role,
-- or a migration. Workflow functions run as their owner, so current_user differs.
create function app.is_client_request()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated');
$$;

-- Role claim of the current API request ('anon', 'authenticated', 'service_role'), or ''
-- outside an API request (migrations, seed). Unlike current_user it is unchanged inside
-- SECURITY DEFINER functions.
create function app.jwt_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
$$;

-- Safe uuid cast used by storage policies on user-supplied object names.
create function app.try_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

grant execute on all functions in schema app to anon, authenticated, service_role;
