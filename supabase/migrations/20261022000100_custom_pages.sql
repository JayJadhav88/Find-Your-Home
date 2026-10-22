-- Pages: the team adds, edits and deletes pages. A page is either formatted text
-- (markdown, any content manager) or the team's own HTML with <style> and <script>
-- (super admins only). The website serves HTML pages in a browser sandbox, so their
-- scripts cannot read visitors' or admins' sign-ins (see apps/web/src/app/pages).

alter table public.content_pages
  add column format text not null default 'markdown' check (format in ('markdown', 'html')),
  add column body_html text not null default '' check (char_length(body_html) <= 500000),
  add column description text check (char_length(description) <= 300),
  -- Shown without the site's header and footer (the HTML is the whole page).
  add column full_page boolean not null default false,
  add column in_footer boolean not null default false,
  add column sort_order integer not null default 0,
  -- About, Contact, Privacy and Terms have their own addresses and cannot be deleted.
  add column is_system boolean not null default false,
  add column created_at timestamptz not null default now();

-- Always linked in the footer by the website; in_footer is for added pages.
update public.content_pages set is_system = true,
  sort_order = case slug when 'about' then 1 when 'contact' then 2 when 'privacy' then 3 else 4 end
where slug in ('about', 'contact', 'privacy', 'terms');

-- Runs as the person saving (not security definer), so app.is_admin() sees them.
create function app.content_pages_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_client_request() and not app.is_admin() then
    if new.format = 'html' and (tg_op = 'INSERT' or old.format <> 'html') then
      raise exception 'Only super admins can switch a page to HTML' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.body_html is distinct from old.body_html or new.full_page is distinct from old.full_page) then
      raise exception 'Only super admins can change a page''s HTML' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.format = 'html' and new.is_published and not old.is_published then
      raise exception 'Only super admins can publish an HTML page' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.is_system := old.is_system;
    new.slug := old.slug;
  elsif app.is_client_request() then
    new.is_system := false;
  end if;
  new.title := btrim(new.title);
  new.description := nullif(btrim(coalesce(new.description, '')), '');
  return new;
end;
$$;

create trigger content_pages_rules before insert or update on public.content_pages
  for each row execute function app.content_pages_rules();

create function app.audit_content_page()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.jwt_role() <> 'authenticated' then
    return null;
  end if;
  if tg_op = 'DELETE' then
    perform app.audit('page.delete', 'content_page', old.slug, jsonb_build_object('title', old.title, 'format', old.format), null);
  elsif tg_op = 'INSERT' then
    perform app.audit('page.create', 'content_page', new.slug, null, jsonb_build_object('title', new.title, 'format', new.format));
  elsif new.body_html is distinct from old.body_html or new.format is distinct from old.format then
    -- HTML changes are recorded with their size, not their content.
    perform app.audit('page.html_change', 'content_page', new.slug,
      jsonb_build_object('format', old.format, 'html_chars', char_length(old.body_html)),
      jsonb_build_object('format', new.format, 'html_chars', char_length(new.body_html)));
  else
    perform app.audit('page.update', 'content_page', new.slug,
      jsonb_build_object('title', old.title, 'published', old.is_published),
      jsonb_build_object('title', new.title, 'published', new.is_published));
  end if;
  return null;
end;
$$;

-- Replaces the general audit trigger, which copied whole rows (up to 500 KB of HTML) into the log.
drop trigger content_pages_audit on public.content_pages;
create trigger content_pages_audit after insert or update or delete on public.content_pages
  for each row execute function app.audit_content_page();

-- Replace "manage everything" with separate rules so system pages cannot be deleted.
drop policy "Content managers manage content pages" on public.content_pages;
create policy "Content managers add pages" on public.content_pages for insert to authenticated
  with check ((select app.can_manage_content()));
create policy "Content managers edit pages" on public.content_pages for update to authenticated
  using ((select app.can_manage_content())) with check ((select app.can_manage_content()));
create policy "Content managers delete their added pages" on public.content_pages for delete to authenticated
  using ((select app.can_manage_content()) and not is_system and (format <> 'html' or (select app.is_admin())));
