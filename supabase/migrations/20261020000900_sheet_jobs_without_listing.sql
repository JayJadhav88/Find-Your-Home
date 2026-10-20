-- Leads without a property (Contact us, leads the team adds) still go to Google Sheets.
-- The job queue required a listing for every job, so saving such a lead failed while
-- Sheets was switched on. Only listing jobs need a listing.
alter table public.job_queue alter column listing_id drop not null;
alter table public.job_queue add constraint job_queue_listing_required
  check (listing_id is not null or kind = 'sync_enquiry_sheet');
