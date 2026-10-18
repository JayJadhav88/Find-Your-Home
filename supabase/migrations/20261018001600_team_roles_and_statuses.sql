-- New enum values must be committed before use, so they get their own migration.

-- Team roles: support handles enquiries, marketing sends broadcasts. (Administrator is the
-- super admin; moderator reviews listings.)
alter type public.app_role add value if not exists 'support';
alter type public.app_role add value if not exists 'marketing';

-- A delivery skipped because the recipient turned that channel off or never opted in.
alter type public.outbox_status add value if not exists 'skipped_preference';

-- Lead pipeline: new -> in_progress (contacted) -> visit_scheduled -> responded -> closed.
alter type public.enquiry_status add value if not exists 'visit_scheduled' after 'in_progress';
