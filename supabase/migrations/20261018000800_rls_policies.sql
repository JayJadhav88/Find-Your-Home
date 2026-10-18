-- Row Level Security for every public table. Spec: docs/03-permissions.md.
-- Tables without a write policy can only be changed by workflow functions.

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.agent_profiles enable row level security;
alter table public.property_types enable row level security;
alter table public.amenities enable row level security;
alter table public.locations enable row level security;
alter table public.currencies enable row level security;
alter table public.site_settings enable row level security;
alter table public.content_pages enable row level security;
alter table public.homepage_sections enable row level security;
alter table public.landing_pages enable row level security;
alter table public.audit_log enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.job_queue enable row level security;
alter table public.data_requests enable row level security;
alter table public.listings enable row level security;
alter table public.listing_private_details enable row level security;
alter table public.listing_media enable row level security;
alter table public.listing_amenities enable row level security;
alter table public.listing_status_events enable row level security;
alter table public.favorites enable row level security;
alter table public.comparison_items enable row level security;
alter table public.enquiries enable row level security;

-- Internal tables in the app schema are not reachable by clients at all.
revoke all on all tables in schema app from anon, authenticated;

-- Server-side-only tables: no client privileges even before RLS.
revoke all on public.notification_outbox, public.job_queue from anon, authenticated;
revoke all on public.audit_log from anon;
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.listing_status_events, public.enquiries, public.data_requests,
  public.user_roles from anon, authenticated;
revoke all on sequence public.listing_reference_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create policy "Users read their own profile; staff read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select app.is_staff()));

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Administrators update any profile"
  on public.profiles for update to authenticated
  using ((select app.is_admin()))
  with check ((select app.is_admin()));

create policy "Users read their own roles; administrators read all"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_admin()));

create policy "Public agent profiles are visible to everyone"
  on public.agent_profiles for select to anon, authenticated
  using (is_public or user_id = (select auth.uid()) or (select app.is_staff()));

create policy "Agents manage their own agent profile"
  on public.agent_profiles for update to authenticated
  using (user_id = (select auth.uid()) and (select app.has_role('agent')))
  with check (user_id = (select auth.uid()) and (select app.has_role('agent')));

create policy "Administrators manage agent profiles"
  on public.agent_profiles for all to authenticated
  using ((select app.is_admin()))
  with check ((select app.is_admin()));

-- ---------------------------------------------------------------------------
-- Reference data and content: public read of active rows, administrator write
-- ---------------------------------------------------------------------------
create policy "Active property types are public" on public.property_types for select to anon, authenticated
  using (is_active or (select app.is_staff()));
create policy "Administrators manage property types" on public.property_types for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy "Active amenities are public" on public.amenities for select to anon, authenticated
  using (is_active or (select app.is_staff()));
create policy "Administrators manage amenities" on public.amenities for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy "Active locations are public" on public.locations for select to anon, authenticated
  using (is_active or (select app.is_staff()));
create policy "Administrators manage locations" on public.locations for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy "Currencies are public" on public.currencies for select to anon, authenticated
  using (true);
create policy "Administrators manage currencies" on public.currencies for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy "Site settings are public" on public.site_settings for select to anon, authenticated
  using (true);
create policy "Administrators update site settings" on public.site_settings for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy "Published content pages are public" on public.content_pages for select to anon, authenticated
  using (is_published or (select app.is_admin()));
create policy "Administrators manage content pages" on public.content_pages for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy "Active homepage sections are public" on public.homepage_sections for select to anon, authenticated
  using (is_active or (select app.is_admin()));
create policy "Administrators manage homepage sections" on public.homepage_sections for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy "Published landing pages are public" on public.landing_pages for select to anon, authenticated
  using (is_published or (select app.is_admin()));
create policy "Administrators manage landing pages" on public.landing_pages for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------
create policy "Administrators read the audit log; moderators read their own actions"
  on public.audit_log for select to authenticated
  using ((select app.is_admin()) or (actor_id = (select auth.uid()) and (select app.is_staff())));

create policy "Users read their own data requests; administrators read all"
  on public.data_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_admin()));

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create policy "Published listings are public; listers and staff see their own"
  on public.listings for select to anon, authenticated
  using (
    status = 'published'
    or owner_id = (select auth.uid())
    or (agent_id = (select auth.uid()) and (select app.has_role('agent')))
    or (select app.is_staff())
  );

create policy "Verified owners and agents create listings"
  on public.listings for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select app.is_active_user())
    and (select app.is_email_verified())
    and ((select app.has_role('owner')) or (select app.has_role('agent')) or (select app.is_admin()))
  );

create policy "Listers edit their listings while editable"
  on public.listings for update to authenticated
  using ((select app.can_edit_listing(id)))
  with check (
    owner_id = (select auth.uid())
    or (agent_id = (select auth.uid()) and (select app.has_role('agent')))
    or (select app.is_admin())
  );

create policy "Listers and staff read private details"
  on public.listing_private_details for select to authenticated
  using ((select app.can_manage_listing(listing_id)));
create policy "Listers add private details while editable"
  on public.listing_private_details for insert to authenticated
  with check ((select app.can_edit_listing(listing_id)));
create policy "Listers update private details while editable"
  on public.listing_private_details for update to authenticated
  using ((select app.can_edit_listing(listing_id)))
  with check ((select app.can_edit_listing(listing_id)));

create policy "Media of public listings is public; listers and staff see all"
  on public.listing_media for select to anon, authenticated
  using ((select app.is_listing_public(listing_id)) or (select app.can_manage_listing(listing_id)));
create policy "Listers add media while editable"
  on public.listing_media for insert to authenticated
  with check ((select app.can_edit_listing(listing_id)));
create policy "Listers update media while editable"
  on public.listing_media for update to authenticated
  using ((select app.can_edit_listing(listing_id)))
  with check ((select app.can_edit_listing(listing_id)));
create policy "Listers remove media while editable"
  on public.listing_media for delete to authenticated
  using ((select app.can_edit_listing(listing_id)));

create policy "Amenities of visible listings are readable"
  on public.listing_amenities for select to anon, authenticated
  using ((select app.is_listing_public(listing_id)) or (select app.can_manage_listing(listing_id)));
create policy "Listers add amenities while editable"
  on public.listing_amenities for insert to authenticated
  with check ((select app.can_edit_listing(listing_id)));
create policy "Listers remove amenities while editable"
  on public.listing_amenities for delete to authenticated
  using ((select app.can_edit_listing(listing_id)));

-- Listers read history through get_listing_history(), which masks staff-only reasons.
create policy "Staff read listing history"
  on public.listing_status_events for select to authenticated
  using ((select app.is_staff()));

-- ---------------------------------------------------------------------------
-- Buyer activity
-- ---------------------------------------------------------------------------
create policy "Users read their favorites" on public.favorites for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users save published listings" on public.favorites for insert to authenticated
  with check (user_id = (select auth.uid()) and (select app.is_listing_public(listing_id)));
create policy "Users remove their favorites" on public.favorites for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their comparison list" on public.comparison_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users add published listings to comparison" on public.comparison_items for insert to authenticated
  with check (user_id = (select auth.uid()) and (select app.is_listing_public(listing_id)));
create policy "Users reorder their comparison list" on public.comparison_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users remove from their comparison list" on public.comparison_items for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Senders, recipients and staff read enquiries"
  on public.enquiries for select to authenticated
  using (
    sender_user_id = (select auth.uid())
    or app.can_handle_enquiry(assigned_to, listing_id)
  );
