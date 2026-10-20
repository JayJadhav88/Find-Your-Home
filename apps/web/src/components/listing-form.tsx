"use client";

import { useActionState, useMemo, useState } from "react";
import { createListing, updateListing } from "@/app/actions/listings";
import { initialFormState } from "@/app/actions/types";
import {
  AREA_UNIT_LABEL,
  FURNISHING_LABEL,
  POSSESSION_LABEL,
  PRICE_PERIOD_LABEL,
} from "@/lib/listing-format";
import type { Taxonomy } from "@/lib/public-data";
import { Alert, Button, Checkbox, Field, Select, TextArea, TextInput } from "./ui";

/** Current values, keyed by form field name (camelCase, matching listingFormSchema). */
export type ListingFormInitial = Record<string, string | boolean | string[] | undefined>;

export function ListingForm({
  taxonomy,
  initial,
  listingId,
  defaultCurrency,
  defaultAreaUnit,
  canListNewProjects = false,
}: {
  taxonomy: Taxonomy;
  initial?: ListingFormInitial;
  listingId?: string;
  defaultCurrency: string | null;
  defaultAreaUnit: string;
  /** Only verified builders (and administrators) may list new projects. */
  canListNewProjects?: boolean;
}) {
  const [state, action, pending] = useActionState(listingId ? updateListing : createListing, initialFormState);
  const errors = state.fieldErrors ?? {};
  const value = (name: string): string => {
    const echoed = state.values?.[name];
    if (echoed !== undefined) return echoed;
    const current = initial?.[name];
    return typeof current === "string" ? current : "";
  };
  const checked = (name: string, fallback = false) =>
    state.values ? state.values[name] === "on" : typeof initial?.[name] === "boolean" ? (initial[name] as boolean) : fallback;

  const [countryId, setCountryId] = useState(value("countryId"));
  const [regionId, setRegionId] = useState(value("regionId"));
  const [cityId, setCityId] = useState(value("cityId"));
  const [priceDisplay, setPriceDisplay] = useState(value("priceDisplay") || "show");
  const [category, setCategory] = useState(value("category") || "resale");
  const purpose = category === "rental" ? "rent" : "sale";

  const locations = taxonomy.locations;
  const countries = locations.filter((location) => location.level === "country");
  const regions = useMemo(() => locations.filter((l) => l.level === "region" && l.parent_id === countryId), [locations, countryId]);
  const cities = useMemo(() => {
    const parents = regionId ? new Set([regionId]) : new Set([countryId, ...regions.map((region) => region.id)]);
    return locations.filter((l) => l.level === "city" && l.parent_id !== null && parents.has(l.parent_id));
  }, [locations, countryId, regionId, regions]);
  const localities = useMemo(() => locations.filter((l) => l.level === "locality" && l.parent_id === cityId), [locations, cityId]);
  const selectedAmenities = new Set(
    state.values ? [] : Array.isArray(initial?.amenityIds) ? (initial.amenityIds as string[]) : [],
  );

  const section = "flex flex-col gap-4 rounded-xl border border-border bg-surface p-5";
  const grid = "grid gap-4 sm:grid-cols-2";

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      {listingId ? <input type="hidden" name="listingId" value={listingId} /> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && state.message ? <Alert tone="success">{state.message}</Alert> : null}

      <fieldset className={section}>
        <legend className="px-1 text-lg font-semibold">Basics</legend>
        <Field label="Title" name="title" error={errors.title} hint="For example: Bright two-bedroom flat near the park" required>
          <TextInput name="title" defaultValue={value("title")} error={errors.title} maxLength={140} required />
        </Field>
        <div className={grid}>
          <Field
            label="Category"
            name="category"
            error={errors.category}
            hint={canListNewProjects ? undefined : "New projects can only be listed by verified builders."}
            required
          >
            <Select name="category" value={category} onChange={(event) => setCategory(event.target.value)} error={errors.category}>
              <option value="rental">Rental</option>
              <option value="resale">Resale</option>
              {canListNewProjects || category === "new_project" ? <option value="new_project">New project (builder)</option> : null}
            </Select>
          </Field>
          <Field label="Property type" name="propertyTypeId" error={errors.propertyTypeId}>
            <Select name="propertyTypeId" defaultValue={value("propertyTypeId")} error={errors.propertyTypeId}>
              <option value="">Choose…</option>
              {taxonomy.propertyTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        {category === "new_project" ? (
          <div className={grid}>
            <Field label="Project name" name="projectName" error={errors.projectName} required>
              <TextInput name="projectName" defaultValue={value("projectName")} error={errors.projectName} maxLength={140} />
            </Field>
            <Field label="Project registration number" name="projectRegistrationNumber" error={errors.projectRegistrationNumber} hint="Optional, for example a regulator's registration number.">
              <TextInput name="projectRegistrationNumber" defaultValue={value("projectRegistrationNumber")} error={errors.projectRegistrationNumber} maxLength={60} />
            </Field>
            <Field label="Price up to" name="priceMax" error={errors.priceMax} hint="Optional: top of the price range. The price field above is the starting price.">
              <TextInput name="priceMax" inputMode="decimal" defaultValue={value("priceMax")} error={errors.priceMax} />
            </Field>
            <Field label="Launch date" name="launchDate" error={errors.launchDate}>
              <TextInput name="launchDate" type="date" defaultValue={value("launchDate")} error={errors.launchDate} />
            </Field>
            <Field label="Configurations" name="configurations" error={errors.configurations} hint="Comma-separated, e.g. 2 BHK, 3 BHK, 4 BHK penthouse.">
              <TextInput name="configurations" defaultValue={value("configurations")} error={errors.configurations} maxLength={400} />
            </Field>
          </div>
        ) : null}
        <Field label="Description" name="description" error={errors.description} hint="At least 30 characters before you can submit. Describe the layout, condition and neighbourhood.">
          <TextArea name="description" defaultValue={value("description")} error={errors.description} rows={8} maxLength={10000} />
        </Field>
      </fieldset>

      <fieldset className={section}>
        <legend className="px-1 text-lg font-semibold">Price</legend>
        <div className={grid}>
          <Field label="Show price" name="priceDisplay">
            <Select name="priceDisplay" value={priceDisplay} onChange={(event) => setPriceDisplay(event.target.value)}>
              <option value="show">Show the price</option>
              <option value="on_request">Price on request</option>
            </Select>
          </Field>
          <Field label={purpose === "rent" ? "Rent" : "Price"} name="priceAmount" error={errors.priceAmount} required={priceDisplay === "show"}>
            <TextInput name="priceAmount" inputMode="decimal" defaultValue={value("priceAmount")} error={errors.priceAmount} />
          </Field>
          <Field label="Currency" name="currency" error={errors.currency}>
            <Select name="currency" defaultValue={value("currency") || defaultCurrency || ""} error={errors.currency}>
              <option value="">Choose…</option>
              {taxonomy.currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Price applies" name="pricePeriod">
            <Select name="pricePeriod" defaultValue={value("pricePeriod") || (purpose === "rent" ? "per_month" : "total")}>
              {Object.entries(PRICE_PERIOD_LABEL).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
          </Field>
        </div>
        {taxonomy.currencies.length === 0 ? (
          <Alert tone="warning">No currencies are enabled yet. An administrator needs to enable one in Admin → Settings.</Alert>
        ) : null}
        <Checkbox name="priceNegotiable" label="Price is negotiable" defaultChecked={checked("priceNegotiable")} />
      </fieldset>

      <fieldset className={section}>
        <legend className="px-1 text-lg font-semibold">Location</legend>
        <div className={grid}>
          <Field label="Country" name="countryId" error={errors.countryId}>
            <Select name="countryId" value={countryId} onChange={(event) => { setCountryId(event.target.value); setRegionId(""); setCityId(""); }} error={errors.countryId}>
              <option value="">Choose…</option>
              {countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}
            </Select>
          </Field>
          <Field label="Region / state" name="regionId">
            <Select name="regionId" value={regionId} onChange={(event) => { setRegionId(event.target.value); setCityId(""); }} disabled={!regions.length}>
              <option value="">{regions.length ? "Choose…" : "Not needed"}</option>
              {regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
            </Select>
          </Field>
          <Field label="City" name="cityId" error={errors.cityId}>
            <Select name="cityId" value={cityId} onChange={(event) => setCityId(event.target.value)} error={errors.cityId} disabled={!countryId}>
              <option value="">Choose…</option>
              {cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
            </Select>
          </Field>
          <Field label="Neighbourhood" name="localityId">
            <Select name="localityId" defaultValue={value("localityId")} disabled={!localities.length}>
              <option value="">{localities.length ? "Choose…" : "None listed"}</option>
              {localities.map((locality) => <option key={locality.id} value={locality.id}>{locality.name}</option>)}
            </Select>
          </Field>
          <Field label="Street address" name="streetAddress" error={errors.streetAddress} hint="Private: never shown publicly.">
            <TextInput name="streetAddress" autoComplete="street-address" defaultValue={value("streetAddress")} error={errors.streetAddress} />
          </Field>
          <Field label="PIN / postal code" name="postalCode" error={errors.postalCode} hint="Used for PIN code and nearby searches.">
            <TextInput name="postalCode" autoComplete="postal-code" defaultValue={value("postalCode")} error={errors.postalCode} />
          </Field>
          <Field label="Nearby landmark" name="landmark" error={errors.landmark} hint="Optional, e.g. near City Mall. Shown to visitors.">
            <TextInput name="landmark" defaultValue={value("landmark")} error={errors.landmark} maxLength={120} />
          </Field>
        </div>
        <Field label="Location shown to visitors" name="addressVisibility">
          <Select name="addressVisibility" defaultValue={value("addressVisibility") || "approximate"}>
            <option value="approximate">Neighbourhood and city only</option>
            <option value="exact">Neighbourhood, city and map pin</option>
            <option value="hidden">City only, no map</option>
          </Select>
        </Field>
      </fieldset>

      <fieldset className={section}>
        <legend className="px-1 text-lg font-semibold">Size and rooms</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Area unit" name="areaUnit" error={errors.areaUnit}>
            <Select name="areaUnit" defaultValue={value("areaUnit") || defaultAreaUnit} error={errors.areaUnit}>
              {Object.entries(AREA_UNIT_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </Field>
          {(
            [
              ["areaValue", "Total area"],
              ["builtUpArea", "Built-up area"],
              ["carpetArea", "Carpet area"],
              ["plotArea", "Plot / land area"],
            ] as const
          ).map(([name, label]) => (
            <Field key={name} label={label} name={name} error={errors[name]}>
              <TextInput name={name} inputMode="decimal" defaultValue={value(name)} error={errors[name]} />
            </Field>
          ))}
          {(
            [
              ["bedrooms", "Bedrooms"],
              ["bathrooms", "Bathrooms"],
              ["balconies", "Balconies"],
              ["parkingSpaces", "Parking spaces"],
              ["floorNumber", "Floor"],
              ["totalFloors", "Floors in building"],
              ["yearBuilt", "Year built"],
            ] as const
          ).map(([name, label]) => (
            <Field key={name} label={label} name={name} error={errors[name]}>
              <TextInput name={name} inputMode="numeric" defaultValue={value(name)} error={errors[name]} />
            </Field>
          ))}
          <Field label="Furnishing" name="furnishing">
            <Select name="furnishing" defaultValue={value("furnishing")}>
              <option value="">Not specified</option>
              {Object.entries(FURNISHING_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Construction / possession" name="possessionStatus">
            <Select name="possessionStatus" defaultValue={value("possessionStatus")}>
              <option value="">Not specified</option>
              {Object.entries(POSSESSION_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </Field>
          <Field label="Available from" name="availableFrom" error={errors.availableFrom}>
            <TextInput name="availableFrom" type="date" defaultValue={value("availableFrom")} error={errors.availableFrom} />
          </Field>
        </div>
      </fieldset>

      {taxonomy.amenities.length ? (
        <fieldset className={section}>
          <legend className="px-1 text-lg font-semibold">Amenities</legend>
          <div className="grid gap-1 sm:grid-cols-3">
            {taxonomy.amenities.map((amenity) => (
              <Checkbox key={amenity.id} name="amenityIds" value={amenity.id} label={amenity.name} defaultChecked={selectedAmenities.has(amenity.id)} />
            ))}
          </div>
        </fieldset>
      ) : null}

      <fieldset className={section}>
        <legend className="px-1 text-lg font-semibold">How people contact you</legend>
        <Checkbox name="contactViaForm" label="Receive enquiries through the website form" defaultChecked={checked("contactViaForm", true)} />
        <Checkbox name="showPhone" label="Show my phone number on the listing" defaultChecked={checked("showPhone")} />
        <Checkbox name="showWhatsapp" label="Show a WhatsApp link (uses my phone number)" defaultChecked={checked("showWhatsapp")} />
        <Checkbox name="showEmail" label="Show my email address on the listing" defaultChecked={checked("showEmail")} />
        <p className="text-sm text-text-muted">Your phone number is set in your profile.</p>
      </fieldset>

      <fieldset className={section}>
        <legend className="px-1 text-lg font-semibold">Videos and virtual tour (optional)</legend>
        <Field
          label="YouTube or Instagram video links"
          name="videoUrls"
          error={errors.videoUrls}
          hint="One link per line, up to 10. For example https://www.youtube.com/watch?v=… or https://www.instagram.com/reel/…"
        >
          <TextArea name="videoUrls" rows={3} defaultValue={value("videoUrls")} error={errors.videoUrls} />
        </Field>
        <Field label="Virtual tour link" name="virtualTourUrl" error={errors.virtualTourUrl}>
          <TextInput name="virtualTourUrl" type="url" placeholder="https://" defaultValue={value("virtualTourUrl")} error={errors.virtualTourUrl} />
        </Field>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : listingId ? "Save changes" : "Save draft and add photos"}
        </Button>
      </div>
    </form>
  );
}
