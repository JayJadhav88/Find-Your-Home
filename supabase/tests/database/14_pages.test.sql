begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('p.admin@example.test');
select tests.create_user('p.content@example.test');
select tests.create_user('p.member@example.test');
select tests.grant_role((select id from auth.users where email = 'p.admin@example.test'), 'administrator');
select tests.grant_role((select id from auth.users where email = 'p.content@example.test'), 'content_manager');

-- Content managers add and edit formatted-text pages.
select tests.as_user('p.content@example.test');
insert into public.content_pages (slug, title) values ('p-home-loans', '  Home loans ');
select is((select title from public.content_pages where slug = 'p-home-loans'), 'Home loans', 'content managers add a page (title tidied)');
select is((select is_system from public.content_pages where slug = 'p-home-loans'), false, 'added pages are never standard pages');
update public.content_pages set body_markdown = '# Loans', is_published = true where slug = 'p-home-loans';
select is((select body_markdown from public.content_pages where slug = 'p-home-loans'), '# Loans', 'content managers edit formatted text');

-- HTML is for super admins only.
select throws_ok(
  $$ insert into public.content_pages (slug, title, format) values ('p-raw', 'Raw', 'html') $$,
  '42501', null, 'content managers cannot add an HTML page'
);
select throws_ok(
  $$ update public.content_pages set body_html = '<script>alert(1)</script>' where slug = 'p-home-loans' $$,
  '42501', null, 'content managers cannot change HTML'
);
select throws_ok(
  $$ update public.content_pages set format = 'html' where slug = 'p-home-loans' $$,
  '42501', null, 'content managers cannot switch a page to HTML'
);

select tests.as_user('p.admin@example.test');
insert into public.content_pages (slug, title, format, body_html, is_published)
values ('p-landing', 'Landing', 'html', '<h1>Hi</h1><style>h1{color:red}</style><script>console.log(1)</script>', true);
select is((select format from public.content_pages where slug = 'p-landing'), 'html', 'super admins add HTML pages with styles and scripts');
update public.content_pages set slug = 'p-renamed', is_system = true where slug = 'p-landing';
select ok(exists (select 1 from public.content_pages where slug = 'p-landing' and not is_system), 'the address and standard-page flag cannot be changed');

-- Deleting
select tests.as_user('p.content@example.test');
delete from public.content_pages where slug = 'about';
select ok(exists (select 1 from public.content_pages where slug = 'about'), 'standard pages cannot be deleted');
delete from public.content_pages where slug = 'p-landing';
select ok(exists (select 1 from public.content_pages where slug = 'p-landing'), 'content managers cannot delete an HTML page');
delete from public.content_pages where slug = 'p-home-loans';
select ok(not exists (select 1 from public.content_pages where slug = 'p-home-loans'), 'content managers delete their text pages');

-- Visitors see published pages only, and cannot change them.
select tests.as_user('p.admin@example.test');
insert into public.content_pages (slug, title) values ('p-draft', 'Draft');
select tests.as_anon();
select ok(exists (select 1 from public.content_pages where slug = 'p-landing'), 'visitors see published pages');
select ok(not exists (select 1 from public.content_pages where slug = 'p-draft'), 'visitors do not see drafts');
select tests.as_user('p.member@example.test');
select throws_ok(
  $$ insert into public.content_pages (slug, title) values ('p-member', 'Mine') $$,
  '42501', null, 'members cannot add pages'
);

-- HTML changes are logged by size, not content.
select tests.as_postgres();
select ok(
  exists (select 1 from public.audit_log where action = 'page.create' and entity_id = 'p-landing'),
  'adding a page is in the audit log'
);

select * from finish();
rollback;
