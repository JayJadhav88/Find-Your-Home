"use client";

import { useActionState, useState } from "react";
import { addQuickVideoLinks, requestQuickShoot, saveQuickContact, saveQuickProperty } from "@/app/actions/quick-listing";
import { initialFormState, type FormState } from "@/app/actions/types";
import { Alert, Button, Field, Select, TextArea, TextInput, cx } from "./ui";

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;
  if (state.ok && state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

// ---------------------------------------------------------------------------
// Step 1: contact details
// ---------------------------------------------------------------------------
export function QuickContactForm({ name, phone }: { name: string; phone: string }) {
  const [state, action, pending] = useActionState(saveQuickContact, initialFormState);
  const errors = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <Feedback state={state} />
      <Field label="Your name" name="name" required error={errors.name}>
        <TextInput name="name" autoComplete="name" defaultValue={state.values?.name ?? name} error={errors.name} />
      </Field>
      <Field label="Mobile number" name="phone" required error={errors.phone} hint="Buyers and tenants reach you on this number. We never show it without your OK.">
        <TextInput name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="98765 43210" defaultValue={state.values?.phone ?? phone} error={errors.phone} />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Continue"}</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 2: the property
// ---------------------------------------------------------------------------
type Option = { id: string; name: string };
type Place = { id: string; name: string; parent_id: string | null };

export function QuickPropertyForm({
  listingId,
  propertyTypes,
  cities,
  localities,
  defaultAreaUnit,
  initial,
}: {
  listingId?: string;
  propertyTypes: Option[];
  cities: Place[];
  localities: Place[];
  defaultAreaUnit: string;
  initial?: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveQuickProperty, initialFormState);
  const errors = state.fieldErrors ?? {};
  const values = { ...initial, ...state.values };
  const [purpose, setPurpose] = useState(values.purpose ?? "sale");
  const [cityId, setCityId] = useState(values.cityId ?? (cities.length === 1 ? cities[0]!.id : ""));
  const [bedrooms, setBedrooms] = useState(values.bedrooms ?? "");
  const cityLocalities = localities.filter((place) => place.parent_id === cityId);

  return (
    <form action={action} className="flex flex-col gap-5">
      <Feedback state={state} />
      {listingId ? <input type="hidden" name="listingId" value={listingId} /> : null}
      <input type="hidden" name="purpose" value={purpose} />
      <input type="hidden" name="bedrooms" value={bedrooms} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">I want to</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["sale", "Sell"],
            ["rent", "Rent out"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={purpose === value}
              onClick={() => setPurpose(value!)}
              className={cx(
                "min-h-12 rounded-lg border px-4 font-semibold",
                purpose === value ? "border-brand bg-brand text-white" : "border-border bg-surface hover:bg-surface-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Property type" name="propertyTypeId" required error={errors.propertyTypeId}>
        <Select name="propertyTypeId" defaultValue={values.propertyTypeId ?? ""} error={errors.propertyTypeId}>
          <option value="">Choose…</option>
          {propertyTypes.map((type) => (
            <option key={type.id} value={type.id}>{type.name}</option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Bedrooms (BHK)</legend>
        <div className="flex flex-wrap gap-2">
          {["1", "2", "3", "4", "5"].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={bedrooms === value}
              onClick={() => setBedrooms(bedrooms === value ? "" : value)}
              className={cx(
                "min-h-11 min-w-14 rounded-full border px-4 text-sm font-semibold",
                bedrooms === value ? "border-brand bg-brand text-white" : "border-border bg-surface hover:bg-surface-muted",
              )}
            >
              {value === "5" ? "5+" : value} BHK
            </button>
          ))}
        </div>
        <p className="text-xs text-text-muted">Skip for shops, offices and plots.</p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" name="cityId" required error={errors.cityId}>
          <Select name="cityId" value={cityId} onChange={(event) => setCityId(event.target.value)} error={errors.cityId}>
            <option value="">Choose…</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>{city.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Locality" name="localityId" error={errors.localityId}>
          <Select name="localityId" key={cityId} defaultValue={values.cityId === cityId ? (values.localityId ?? "") : ""} disabled={!cityLocalities.length} error={errors.localityId}>
            <option value="">{cityLocalities.length ? "Choose…" : "Choose the city first"}</option>
            {cityLocalities.map((place) => (
              <option key={place.id} value={place.id}>{place.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label="Area" name="areaValue" required error={errors.areaValue}>
          <TextInput name="areaValue" inputMode="decimal" placeholder="1050" defaultValue={values.areaValue} error={errors.areaValue} />
        </Field>
        <Field label="Unit" name="areaUnit">
          <Select name="areaUnit" defaultValue={values.areaUnit ?? defaultAreaUnit}>
            <option value="sq_ft">sq ft</option>
            <option value="sq_m">sq m</option>
            <option value="acre">acres</option>
            <option value="hectare">hectares</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={purpose === "rent" ? "Monthly rent (₹)" : "Expected price (₹)"} name="priceAmount" required error={errors.priceAmount}>
          <TextInput name="priceAmount" inputMode="numeric" placeholder={purpose === "rent" ? "25000" : "8500000"} defaultValue={values.priceAmount} error={errors.priceAmount} />
        </Field>
        <Field label="Furnishing" name="furnishing">
          <Select name="furnishing" defaultValue={values.furnishing ?? ""}>
            <option value="">Not sure</option>
            <option value="unfurnished">Unfurnished</option>
            <option value="semi_furnished">Semi-furnished</option>
            <option value="furnished">Fully furnished</option>
          </Select>
        </Field>
      </div>

      <Field label="Anything buyers should know? (optional)" name="description" hint="We write a short description for you if you leave this empty." error={errors.description}>
        <TextArea name="description" rows={3} className="min-h-24" defaultValue={values.description} placeholder="East-facing, near the metro, covered parking…" />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save and add photos"}</Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 3: video links
// ---------------------------------------------------------------------------
export function QuickVideoLinkForm({ listingId }: { listingId: string }) {
  const [state, action, pending] = useActionState(addQuickVideoLinks, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="listingId" value={listingId} />
      <Feedback state={state} />
      <Field label="YouTube or Instagram link" name="videoUrls" error={state.fieldErrors?.videoUrls}>
        <div className="flex flex-wrap gap-2">
          <TextInput name="videoUrls" type="url" placeholder="https://youtu.be/…" className="flex-1" defaultValue={state.values?.videoUrls} error={state.fieldErrors?.videoUrls} />
          <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Adding…" : "Add video"}</Button>
        </div>
      </Field>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 4: professional shoot
// ---------------------------------------------------------------------------
export function ShootRequestForm({ listingId, minDate }: { listingId: string; minDate: string }) {
  const [state, action, pending] = useActionState(requestQuickShoot, initialFormState);
  const errors = state.fieldErrors ?? {};
  if (state.ok) return <Alert tone="success">{state.message}</Alert>;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="listingId" value={listingId} />
      <Feedback state={state} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Preferred date" name="date" required error={errors.date}>
          <TextInput name="date" type="date" min={minDate} defaultValue={state.values?.date} error={errors.date} />
        </Field>
        <Field label="Time of day" name="slot" required error={errors.slot}>
          <Select name="slot" defaultValue={state.values?.slot ?? "morning"} error={errors.slot}>
            <option value="morning">Morning (9 am – 12 pm)</option>
            <option value="afternoon">Afternoon (12 – 4 pm)</option>
            <option value="evening">Evening (4 – 7 pm)</option>
          </Select>
        </Field>
      </div>
      <Field label="Notes for the photographer (optional)" name="notes">
        <TextInput name="notes" placeholder="Keys with the watchman, park in visitor parking…" defaultValue={state.values?.notes} />
      </Field>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Sending…" : "Request a shoot"}</Button>
      </div>
    </form>
  );
}
