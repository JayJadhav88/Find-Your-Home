-- After submitting, the lister gets an in-app (and phone) notice with the expected review
-- time from site settings. Same function as before plus the notice.
create or replace function public.submit_listing(p_listing_id uuid)
returns public.listing_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.listings := app.lock_listing(p_listing_id);
  missing text[];
begin
  perform app.require(
    app.is_active_user() and (l.owner_id = auth.uid() or (l.agent_id = auth.uid() and app.has_role('agent'))),
    'You can only submit your own listings'
  );
  perform app.require(app.is_email_verified(), 'Verify your email address before submitting');
  perform app.require_state(l.status in ('draft', 'rejected'), 'Only drafts or rejected listings can be submitted');

  missing := app.listing_missing_fields(l);
  if cardinality(missing) > 0 then
    raise exception 'Listing is incomplete' using errcode = '22023', detail = array_to_string(missing, ', ');
  end if;

  perform app.check_rate_limit('submit:' || auth.uid(), (app.settings()).submission_limit_per_day, interval '1 day');

  update public.listings set status = 'pending_review', submitted_at = now() where id = l.id;
  perform app.log_listing_status(l.id, l.status, 'pending_review');
  perform app.notify_role('moderator', 'listing_submitted',
    jsonb_build_object('listing_id', l.id, 'reference', l.reference_code, 'title', l.title));
  perform app.deliver_to_user(auth.uid(), 'listing_received',
    jsonb_build_object('listing_id', l.id, 'reference', l.reference_code, 'title', l.title,
                       'review_hours', (app.settings()).review_hours_target),
    array['push']::public.notification_channel[]);
  return 'pending_review';
end;
$$;
