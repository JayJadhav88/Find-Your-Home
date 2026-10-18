import { describe, expect, it } from "vitest";
import { Constants } from "./database.types";
import * as domain from "./domain";

// Guards against the shared enums drifting from the database. Regenerate types with
// `pnpm db:types` after changing an enum in a migration.
const pairs = {
  app_role: domain.APP_ROLES,
  listing_purpose: domain.LISTING_PURPOSES,
  listing_status: domain.LISTING_STATUSES,
  price_period: domain.PRICE_PERIODS,
  price_display: domain.PRICE_DISPLAYS,
  address_visibility: domain.ADDRESS_VISIBILITIES,
  furnishing: domain.FURNISHINGS,
  possession_status: domain.POSSESSION_STATUSES,
  area_unit: domain.AREA_UNITS,
  enquiry_kind: domain.ENQUIRY_KINDS,
  enquiry_status: domain.ENQUIRY_STATUSES,
  visit_status: domain.VISIT_STATUSES,
} as const;

describe("domain enums match the database", () => {
  for (const [name, values] of Object.entries(pairs)) {
    it(name, () => {
      expect([...values]).toEqual([...Constants.public.Enums[name as keyof typeof pairs]]);
    });
  }
});
