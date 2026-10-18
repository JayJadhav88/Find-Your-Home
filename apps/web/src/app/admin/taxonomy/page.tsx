import { Suspense } from "react";
import { saveTaxonomyItem } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Card, Checkbox, PageHeader, Select, TextInput } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase";

export default function AdminTaxonomyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Taxonomy />
    </Suspense>
  );
}

const label = "flex flex-col gap-1 text-sm font-medium";

async function Taxonomy() {
  await requireAdmin("/admin/taxonomy");
  const supabase = await createUserClient();
  // Staff see inactive rows too (RLS), so items can be re-activated.
  const [types, amenities, locations] = await Promise.all([
    supabase.from("property_types").select("*").order("sort_order"),
    supabase.from("amenities").select("*").order("sort_order"),
    supabase.from("locations").select("*").order("level").order("name"),
  ]);
  const allLocations = locations.data ?? [];
  const nameOf = (id: string | null) => allLocations.find((location) => location.id === id)?.name ?? "";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Types, amenities & places" description="Changes apply immediately. Deactivate instead of deleting so existing listings stay valid." />

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Property types</h2>
        <ul className="flex flex-col gap-2">
          {(types.data ?? []).map((type) => (
            <li key={type.id}>
              <ActionForm action={saveTaxonomyItem} submitLabel="Save" submitAriaLabel={`Save ${type.name}`} variant="secondary" inline>
                <input type="hidden" name="table" value="property_types" />
                <input type="hidden" name="id" value={type.id} />
                <label className={label}>Name<TextInput bare name="name" defaultValue={type.name} /></label>
                <Checkbox name="isResidential" label="Residential" defaultChecked={type.is_residential} />
                <Checkbox name="isActive" label="Active" defaultChecked={type.is_active} />
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={saveTaxonomyItem} submitLabel="Add type" inline>
          <input type="hidden" name="table" value="property_types" />
          <label className={label}>New type<TextInput bare name="name" placeholder="e.g. Duplex" /></label>
          <label className={label}>
            Kind
            <Select bare name="isResidential" defaultValue="1">
              <option value="1">Residential</option>
              <option value="0">Commercial / land</option>
            </Select>
          </label>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Amenities</h2>
        <ul className="flex flex-col gap-2">
          {(amenities.data ?? []).map((amenity) => (
            <li key={amenity.id}>
              <ActionForm action={saveTaxonomyItem} submitLabel="Save" submitAriaLabel={`Save ${amenity.name}`} variant="secondary" inline>
                <input type="hidden" name="table" value="amenities" />
                <input type="hidden" name="id" value={amenity.id} />
                <label className={label}>Name<TextInput bare name="name" defaultValue={amenity.name} /></label>
                <label className={label}>Group<TextInput bare name="category" defaultValue={amenity.category ?? ""} /></label>
                <Checkbox name="isActive" label="Active" defaultChecked={amenity.is_active} />
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={saveTaxonomyItem} submitLabel="Add amenity" inline>
          <input type="hidden" name="table" value="amenities" />
          <label className={label}>New amenity<TextInput bare name="name" /></label>
          <label className={label}>Group<TextInput bare name="category" placeholder="e.g. Building" /></label>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Places</h2>
        <p className="text-sm text-text-muted">
          Countries contain regions (optional) and cities; cities contain neighbourhoods. Use the two-letter ISO country code (e.g. GB, IN, US).
        </p>
        <ul className="flex flex-col gap-2">
          {allLocations.map((location) => (
            <li key={location.id}>
              <ActionForm action={saveTaxonomyItem} submitLabel="Save" submitAriaLabel={`Save ${location.name}`} variant="secondary" inline>
                <input type="hidden" name="table" value="locations" />
                <input type="hidden" name="id" value={location.id} />
                <input type="hidden" name="level" value={location.level} />
                <span className="w-24 text-sm text-text-muted">{location.level}</span>
                <label className={label}>Name<TextInput bare name="name" defaultValue={location.name} /></label>
                <span className="text-sm text-text-muted">{location.parent_id ? `in ${nameOf(location.parent_id)}` : location.country_code}</span>
                <Checkbox name="isActive" label="Active" defaultChecked={location.is_active} />
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={saveTaxonomyItem} submitLabel="Add place" inline>
          <input type="hidden" name="table" value="locations" />
          <label className={label}>Name<TextInput bare name="name" /></label>
          <label className={label}>
            Level
            <Select bare name="level" defaultValue="city">
              <option value="country">Country</option>
              <option value="region">Region / state</option>
              <option value="city">City</option>
              <option value="locality">Neighbourhood</option>
            </Select>
          </label>
          <label className={label}>
            Inside
            <Select bare name="parentId" defaultValue="">
              <option value="">— (countries only)</option>
              {allLocations
                .filter((location) => location.level !== "locality")
                .map((location) => (
                  <option key={location.id} value={location.id}>{location.name} ({location.level})</option>
                ))}
            </Select>
          </label>
          <label className={label}>Country code<TextInput bare name="countryCode" maxLength={2} className="w-20 uppercase" /></label>
        </ActionForm>
      </Card>
    </div>
  );
}
