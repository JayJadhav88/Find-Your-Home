-- Favorites, comparison lists and enquiries / visit requests.

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index favorites_listing_idx on public.favorites (listing_id);

create table public.comparison_items (
  user_id uuid not null references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create function app.enforce_comparison_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.comparison_items where user_id = new.user_id)
     >= (app.settings()).comparison_max then
    raise exception 'Your comparison list is full. Remove a property first.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger comparison_items_limit before insert on public.comparison_items
  for each row execute function app.enforce_comparison_limit();

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  sender_user_id uuid references public.profiles (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  phone text check (char_length(phone) <= 32),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  kind public.enquiry_kind not null default 'enquiry',
  requested_visit_at timestamptz,
  requested_timezone text,
  visit_status public.visit_status,
  status public.enquiry_status not null default 'new',
  consent_text_version text check (char_length(consent_text_version) <= 40),
  ip_hash text,
  -- Who receives the lead: the assigned agent, otherwise the owner.
  assigned_to uuid references public.profiles (id) on delete set null,
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enquiries_visit_fields check (
    (kind = 'visit_request') = (requested_visit_at is not null and visit_status is not null)
  )
);

create index enquiries_listing_idx on public.enquiries (listing_id, created_at desc);
create index enquiries_assigned_idx on public.enquiries (assigned_to, status, created_at desc);
create index enquiries_sender_idx on public.enquiries (sender_user_id, created_at desc);
create index enquiries_status_idx on public.enquiries (status, created_at desc);

create trigger enquiries_updated_at before update on public.enquiries
  for each row execute function app.set_updated_at();

-- May read and act on an enquiry as the recipient (owner only when owner leads are enabled).
create function app.can_handle_enquiry(p_assigned_to uuid, p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_staff() or (
    app.is_active_user()
    and p_assigned_to = auth.uid()
    and exists (
      select 1 from public.listings l
      where l.id = p_listing_id
        and (
          (l.agent_id = auth.uid() and app.has_role('agent'))
          or (l.owner_id = auth.uid() and (app.settings()).owner_leads_enabled)
        )
    )
  );
$$;

grant execute on function app.can_handle_enquiry(uuid, uuid) to anon, authenticated, service_role;
