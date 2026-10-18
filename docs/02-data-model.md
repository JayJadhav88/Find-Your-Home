# 02 · Data model outline

Status: **Phase 0 outline.** Final column types, indexes and constraints are written in Phase 1 migrations. All tables have `created_at` / `updated_at` (trigger-maintained) unless noted, UUID primary keys, and RLS enabled.

## Enumerations

| Enum | Values |
| --- | --- |
| `app_role` | `buyer`, `owner`, `agent`, `moderator`, `administrator` (`visitor` = no session, not stored) |
| `account_status` | `active`, `suspended`, `deletion_requested` |
| `listing_purpose` | `sale`, `rent` |
| `listing_status` | `draft`, `pending_review`, `published`, `rejected`, `suspended`, `archived`, `sold`, `rented` |
| `price_period` | `total`, `per_month`, `per_year`, `per_week`, `per_day` |
| `price_display` | `show`, `on_request` |
| `address_visibility` | `exact`, `approximate`, `hidden` |
| `furnishing` | `unfurnished`, `semi_furnished`, `furnished` |
| `possession_status` | `ready`, `under_construction`, `available_from_date` |
| `area_unit` | `sq_m`, `sq_ft`, `acre`, `hectare` (extendable by migration) |
| `enquiry_kind` / `enquiry_status` | `enquiry`, `visit_request` / `new`, `in_progress`, `responded`, `closed`, `spam` |
| `visit_status` | `requested`, `confirmed`, `declined`, `cancelled` |

Property types, amenities and locations are **tables**, not enums, so administrators can add them without code changes.

## Accounts

- **profiles** — `id` (= `auth.users.id`), `display_name`, `phone`, `avatar_key`, `status account_status`, `preferred_locale`, `marketing_opt_in`.
- **user_roles** — `(user_id, role)` PK, `granted_by`, `granted_at`. Default `buyer` row created by trigger on sign-up.
- **agent_profiles** — `user_id` PK, `agency_name`, `bio`, `licence_reference` (free text, shown as "not verified" until verification exists), `public_email`, `public_phone`, `whatsapp`, `is_public`.

## Taxonomy and settings

- **property_types** — `slug` unique, `name`, `is_residential`, `is_active`, `sort_order`.
- **amenities** — `slug` unique, `name`, `category`, `is_active`, `sort_order`.
- **locations** — hierarchical: `parent_id`, `level` (`country`, `region`, `city`, `locality`), `name`, `slug` (unique per parent), `country_code` (ISO 3166-1), optional centroid `lat/lng`. Supported countries are whatever rows exist.
- **currencies** — `code` (ISO 4217) PK, `name`, `minor_units`, `is_enabled`.
- **site_settings** — single typed row: brand name, contact email/phone/WhatsApp, default locale/currency/timezone, area unit default, moderation rules (`material_change_policy`, `material_fields[]`), upload limits, comparison max, SEO defaults, feature flags. Admin-editable, audited.
- **content_pages** — `slug` (`about`, `privacy`, `terms`, …), `title`, `body_markdown`, `is_published`, `reviewed_note`. Legal pages ship **unpublished** with a "legal text required" notice.
- **homepage_sections** — ordered blocks (hero copy, featured listings, curated location links).
- **landing_pages** — curated SEO pages: `slug`, optional `location_id`, optional `property_type_id`, `purpose`, `title`, `intro`, `is_indexable`.

## Listings

- **listings**
  - Identity: `id`, `reference_code` (sequence-based, e.g. `FYH-001042`, unique), `slug`, `owner_id`, `agent_id` (nullable), `title`, `description`.
  - Classification: `purpose`, `property_type_id`, `status`, `is_featured`, `featured_until`. "New" is derived from `first_published_at` and a setting, not stored.
  - Pricing: `price_amount numeric(14,2)`, `currency` → currencies, `price_period`, `price_negotiable`, `price_display`.
  - Public location: `country_id`, `region_id`, `city_id`, `locality_id` (→ locations), `postal_code`, `public_lat/public_lng` (rounded/offset when visibility is `approximate`), `address_visibility`.
  - Measurements: `area_value` + `area_unit`, `built_up_area`, `carpet_area`, `plot_area` (each value + unit).
  - Rooms/features: `bedrooms`, `bathrooms`, `balconies`, `parking_spaces`, `floor_number`, `total_floors`, `year_built`, `furnishing`, `possession_status`, `available_from`.
  - Media links: `video_url`, `virtual_tour_url` (validated URL allowlist of hosts configurable).
  - Contact preferences: `contact_via_form`, `show_phone`, `show_whatsapp`, `show_email`.
  - SEO: `seo_title`, `seo_description`.
  - Lifecycle: `submitted_at`, `published_at`, `first_published_at`, `reviewed_by`, `reviewed_at`, `archived_at`.
  - Search: generated `search_vector tsvector`.
  - Constraints: non-negative numbers, sane ranges, `total_floors >= floor_number`, currency enabled, published rows must have ≥1 image and a cover (checked by the approval function).
  - Indexes: `(status, purpose, city_id, price_amount, id)`, `(status, published_at desc, id)`, `property_type_id`, `bedrooms`, GIN on `search_vector`.
- **listing_private_details** — `listing_id` PK, `street_address`, `exact_lat/exact_lng`, `owner_notes`. Separate table because RLS works on rows, not columns: the public can read a published listing row but never this one.
- **listing_media** — `listing_id`, `kind` (`image`, `document`), `upload_key` (private bucket), `public_key` (set only while published), `mime_type`, `bytes`, `width`, `height`, `alt_text`, `sort_order`, `is_cover` (partial unique index: one cover per listing).
- **listing_amenities** — `(listing_id, amenity_id)` PK.
- **listing_status_events** — `listing_id`, `from_status`, `to_status`, `actor_id`, `reason`, `reason_visible_to_owner`, `created_at`. Append-only; forms the moderation history.

### Listing lifecycle

```
            submit                approve
  draft ───────────► pending_review ─────────► published ──► sold / rented
    ▲   ◄─────────── │  withdraw     │ reject      │  │ suspend      │
    │                ▼               ▼             │  ▼              │
    └──── edit ─── rejected      (reason)          │ suspended ──────┤
                                                   │  (reinstate)    │
       material edit (policy: unpublish_until_review) ─► pending_review
                                 archive from any non-draft state ─► archived ─► restore → draft
```

Only the workflow functions change `status`; each transition is checked against an allowed-transition table and role, and writes a `listing_status_events` row plus an `audit_log` row for staff actions.

MVP material-change policy: editing a configured material field (price, purpose, type, location, area, bedrooms, bathrooms, photos) on a published listing moves it back to `pending_review`. A later option keeps the live version visible while a pending revision is reviewed (`listing_revisions` table).

## Buyer activity

- **favorites** — `(user_id, listing_id)` PK.
- **comparison_items** — `(user_id, listing_id)` PK, `position`; max size from settings, enforced in a function. Visitors use local storage and are invited to sign in to keep the list.
- **enquiries** — `listing_id`, `sender_user_id` (nullable for visitors), `name`, `email`, `phone`, `message`, `kind`, `requested_visit_at timestamptz`, `requested_timezone`, `visit_status`, `status`, `consent_text_version`, `ip_hash`, `assigned_to` (owner/agent), `handled_by`, `handled_at`. Visit requests display as "requested" until the owner/agent confirms.

## Operations

- **notification_outbox** — `kind`, `recipient_email`, `template`, `template_data` (validated per template), `status` (`pending`, `sent`, `failed`, `skipped_not_configured`), `attempts`, `next_attempt_at`, `last_error`, `provider_message_id`, `sent_at`.
- **rate_limit_buckets** — `key`, `window_start`, `count`; used by `app.check_rate_limit()`.
- **audit_log** — `actor_id`, `action`, `entity_type`, `entity_id`, `before`, `after` (JSON snapshots of the changed row are the one deliberate use of JSON), `ip_hash`, `created_at`. Append-only.
- **data_requests** — account export/deletion requests with status and completion timestamps.

## Storage buckets

| Bucket | Public | Read | Write |
| --- | --- | --- | --- |
| `listing-uploads` | No | Listing owner, assigned agent, staff | Listing owner (while editable), staff |
| `listing-public` | Yes (CDN) | Everyone | Edge Function only (service role) |
| `listing-documents` | No | Signed URL after permission check | Listing owner, staff |
| `avatars` | Yes | Everyone | The profile's own user |

Allowed image types (configurable): JPEG, PNG, WebP. HEIC is converted to JPEG on the device before upload; files are type-checked by content and metadata-stripped on publish. Default max 10 MB per image, 30 images per listing.
