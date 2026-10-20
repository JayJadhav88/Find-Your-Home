-- Batch 1 enum values (committed on their own so later migrations can use them).

-- Lead pipeline from the partner scope: New, Assigned, Contacted, Qualified, Visit scheduled,
-- Negotiation, Won, Lost, Unqualified. Existing values stay valid (in_progress = Contacted).
alter type public.enquiry_status add value if not exists 'assigned' after 'new';
alter type public.enquiry_status add value if not exists 'qualified' after 'in_progress';
alter type public.enquiry_status add value if not exists 'negotiation' after 'visit_scheduled';
alter type public.enquiry_status add value if not exists 'won' after 'negotiation';
alter type public.enquiry_status add value if not exists 'lost' after 'won';
alter type public.enquiry_status add value if not exists 'unqualified' after 'lost';

-- Team roles: CRM manager (all leads, assignment), sales agent (only leads assigned to them),
-- content manager (site content, banners, floating button).
alter type public.app_role add value if not exists 'crm_manager';
alter type public.app_role add value if not exists 'sales_agent';
alter type public.app_role add value if not exists 'content_manager';

-- New-launch construction status: Upcoming, Under construction, Ready to move.
alter type public.possession_status add value if not exists 'upcoming' before 'ready';
