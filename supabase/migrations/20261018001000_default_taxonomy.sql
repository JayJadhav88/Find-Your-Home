-- Starter property types and amenities. Administrators can rename, deactivate or add
-- to these from the admin panel; no code change is needed.

insert into public.property_types (slug, name, is_residential, sort_order) values
  ('apartment', 'Apartment', true, 10),
  ('house', 'House', true, 20),
  ('villa', 'Villa', true, 30),
  ('townhouse', 'Townhouse', true, 40),
  ('studio', 'Studio', true, 50),
  ('penthouse', 'Penthouse', true, 60),
  ('plot', 'Plot / Land', false, 70),
  ('office', 'Office', false, 80),
  ('shop', 'Shop / Retail', false, 90),
  ('warehouse', 'Warehouse', false, 100)
on conflict (slug) do nothing;

insert into public.amenities (slug, name, category, sort_order) values
  ('parking', 'Parking', 'Building', 10),
  ('lift', 'Lift / Elevator', 'Building', 20),
  ('security', '24-hour security', 'Building', 30),
  ('power-backup', 'Power backup', 'Building', 40),
  ('gym', 'Gym', 'Lifestyle', 50),
  ('swimming-pool', 'Swimming pool', 'Lifestyle', 60),
  ('garden', 'Garden', 'Lifestyle', 70),
  ('play-area', 'Children''s play area', 'Lifestyle', 80),
  ('air-conditioning', 'Air conditioning', 'Home', 90),
  ('heating', 'Heating', 'Home', 100),
  ('balcony', 'Balcony', 'Home', 110),
  ('wheelchair-access', 'Wheelchair accessible', 'Accessibility', 120),
  ('pet-friendly', 'Pet friendly', 'Policies', 130),
  ('internet', 'Internet ready', 'Home', 140)
on conflict (slug) do nothing;
