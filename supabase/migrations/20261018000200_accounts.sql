-- Accounts: profiles, roles, agent profiles, role helper functions, sign-up trigger.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  phone text check (char_length(phone) <= 32),
  avatar_key text check (char_length(avatar_key) <= 300),
  status public.account_status not null default 'active',
  preferred_locale text check (preferred_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index user_roles_role_idx on public.user_roles (role);

create table public.agent_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  agency_name text check (char_length(agency_name) <= 120),
  bio text check (char_length(bio) <= 2000),
  -- Free text supplied by the agent; shown as unverified until verification exists.
  licence_reference text check (char_length(licence_reference) <= 80),
  public_email text check (public_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(public_email) <= 254),
  public_phone text check (char_length(public_phone) <= 32),
  whatsapp text check (char_length(whatsapp) <= 32),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger agent_profiles_updated_at before update on public.agent_profiles
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers. They read the tables (not JWT claims) so role changes and
-- suspensions take effect on the next request. SECURITY DEFINER avoids RLS
-- recursion when used inside policies.
-- ---------------------------------------------------------------------------
create function app.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

create function app.has_role(required public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role = required
      and p.status = 'active'
  );
$$;

create function app.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role('moderator') or app.has_role('administrator');
$$;

create function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.has_role('administrator');
$$;

create function app.is_email_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

grant execute on function
  app.is_active_user(), app.has_role(public.app_role), app.is_staff(), app.is_admin(), app.is_email_verified()
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sign-up: every new auth user gets a profile and the buyer role.
-- ---------------------------------------------------------------------------
create function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if requested_name = '' or char_length(requested_name) > 100 then
    requested_name := left(split_part(coalesce(new.email, 'Member'), '@', 1), 100);
  end if;

  insert into public.profiles (id, display_name) values (new.id, requested_name);
  insert into public.user_roles (user_id, role) values (new.id, 'buyer');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Clients may edit their own profile details but never their account status.
create function app.protect_profile_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_client_request() and new.status is distinct from old.status then
    raise exception 'Account status can only be changed by an administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_columns before update on public.profiles
  for each row execute function app.protect_profile_columns();
