-- New kinds of lead from the property page pop-up (used by 20261030000200).
alter type public.enquiry_kind add value if not exists 'brochure';
alter type public.enquiry_kind add value if not exists 'callback';
alter type public.enquiry_kind add value if not exists 'contact_reveal';
