// Domain enumerations. These mirror the PostgreSQL enums defined in
// supabase/migrations and must be changed together with a migration.

export const APP_ROLES = [
  "buyer", "owner", "agent", "moderator", "administrator", "builder", "support", "marketing",
  "crm_manager", "sales_agent", "content_manager",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

/** Roles that may review listings. */
export const STAFF_ROLES = ["moderator", "administrator"] as const satisfies readonly AppRole[];
/** Roles that may open the admin panel. Administrator is the super admin. */
export const TEAM_ROLES = [
  "administrator", "crm_manager", "sales_agent", "moderator", "support", "content_manager", "marketing",
] as const satisfies readonly AppRole[];

export const ROLE_LABEL: Record<AppRole, string> = {
  buyer: "Member",
  owner: "Owner",
  agent: "Agent",
  builder: "Builder",
  moderator: "Moderator (reviews listings)",
  administrator: "Super admin (everything)",
  support: "Support (enquiries)",
  marketing: "Marketing (messages)",
  crm_manager: "CRM manager (all leads)",
  sales_agent: "Sales agent (own leads)",
  content_manager: "Content manager (site content)",
};

export const LISTING_CATEGORIES = ["rental", "resale", "new_project"] as const;
export type ListingCategory = (typeof LISTING_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ListingCategory, string> = {
  rental: "Rental",
  resale: "Resale",
  new_project: "New project",
};

export const LISTING_PURPOSES = ["sale", "rent"] as const;
export type ListingPurpose = (typeof LISTING_PURPOSES)[number];

export const LISTING_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "rejected",
  "suspended",
  "archived",
  "sold",
  "rented",
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const PRICE_PERIODS = ["total", "per_month", "per_year", "per_week", "per_day"] as const;
export type PricePeriod = (typeof PRICE_PERIODS)[number];

export const PRICE_DISPLAYS = ["show", "on_request"] as const;
export type PriceDisplay = (typeof PRICE_DISPLAYS)[number];

export const ADDRESS_VISIBILITIES = ["exact", "approximate", "hidden"] as const;
export type AddressVisibility = (typeof ADDRESS_VISIBILITIES)[number];

export const FURNISHINGS = ["unfurnished", "semi_furnished", "furnished"] as const;
export type Furnishing = (typeof FURNISHINGS)[number];

export const POSSESSION_STATUSES = ["upcoming", "ready", "under_construction", "available_from_date"] as const;
export type PossessionStatus = (typeof POSSESSION_STATUSES)[number];

export const AREA_UNITS = ["sq_m", "sq_ft", "acre", "hectare"] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

export const ENQUIRY_KINDS = ["enquiry", "visit_request"] as const;
export type EnquiryKind = (typeof ENQUIRY_KINDS)[number];

export const ENQUIRY_STATUSES = [
  "new", "assigned", "in_progress", "qualified", "visit_scheduled", "negotiation", "won", "lost", "unqualified",
  "responded", "closed", "spam",
] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "Contacted",
  qualified: "Qualified",
  visit_scheduled: "Visit scheduled",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
  unqualified: "Unqualified",
  responded: "Responded",
  closed: "Closed",
  spam: "Spam",
};

export const NOTIFICATION_CHANNELS = ["email", "whatsapp", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const VISIT_STATUSES = ["requested", "confirmed", "declined", "cancelled"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** Statuses whose listings are visible to the public. */
export const PUBLIC_LISTING_STATUSES = ["published"] as const satisfies readonly ListingStatus[];

/** Pipeline stages shown first; Responded/Closed are the simpler lister-side outcomes. */
export const PIPELINE_STATUSES = [
  "new", "assigned", "in_progress", "qualified", "visit_scheduled", "negotiation", "won", "lost", "unqualified",
] as const satisfies readonly EnquiryStatus[];

export const LEAD_INTERESTS = ["buy", "rent", "new_launch", "sell", "rent_out", "list_property", "referral", "other"] as const;
export type LeadInterest = (typeof LEAD_INTERESTS)[number];
export const LEAD_INTEREST_LABEL: Record<LeadInterest, string> = {
  buy: "Buy",
  rent: "Rent",
  new_launch: "New launch",
  sell: "Sell my property",
  rent_out: "Rent out my property",
  list_property: "List my property",
  referral: "Referral",
  other: "Other",
};

export const LEAD_SOURCES = ["website", "app", "contact_form", "qr", "referral", "campaign", "manual", "organic", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  website: "Website",
  app: "App",
  contact_form: "Contact form",
  qr: "QR code",
  referral: "Referral",
  campaign: "Campaign",
  manual: "Added by team",
  organic: "Organic",
  other: "Other",
};

export const LOST_REASONS = [
  "Budget too low", "Found elsewhere", "Location not suitable", "Not responding", "Just browsing", "Property no longer available", "Other",
] as const;

export const CALL_OUTCOMES = ["no_answer", "busy", "left_message", "wrong_number", "contacted"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  no_answer: "No answer",
  busy: "Busy",
  left_message: "Left a message",
  wrong_number: "Wrong number",
  contacted: "Spoke to them",
};
