import { Suspense } from "react";
import { setCurrencyEnabled, updateSettings } from "@/app/actions/admin";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Badge, Card, Checkbox, Field, PageHeader, Select, TextArea, TextInput } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { AREA_UNIT_LABEL } from "@/lib/listing-format";
import { createUserClient } from "@/lib/supabase";

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  await requireAdmin("/admin/settings");
  const supabase = await createUserClient();
  const [{ data: settings }, { data: currencies }] = await Promise.all([
    supabase.from("site_settings").select("*").single(),
    supabase.from("currencies").select("*").order("code"),
  ]);
  if (!settings) return <p>Settings unavailable.</p>;
  const enabled = (currencies ?? []).filter((currency) => currency.is_enabled);
  const grid = "grid gap-4 sm:grid-cols-2";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" description="Brand, contact details, regional defaults and platform rules. Changes are audited." />

      <Card>
        <h2 className="text-lg font-semibold">Currencies</h2>
        <p className="mt-1 text-sm text-text-muted">Enable the currencies listers can use. Enable at least one, then choose the default below.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(currencies ?? []).map((currency) => (
            <li key={currency.code} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1">
              <span className="text-sm">
                {currency.code} <span className="text-text-muted">{currency.name}</span>{" "}
                {currency.is_enabled ? <Badge tone="published">on</Badge> : null}
              </span>
              <ActionForm action={setCurrencyEnabled} submitLabel={currency.is_enabled ? "Disable" : "Enable"} variant="ghost" inline>
                <input type="hidden" name="code" value={currency.code} />
                <input type="hidden" name="enabled" value={currency.is_enabled ? "0" : "1"} />
              </ActionForm>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <ActionForm action={updateSettings} submitLabel="Save settings">
          <h2 className="text-lg font-semibold">Brand and contact</h2>
          <div className={grid}>
            <Field label="Brand name" name="brandName" required><TextInput name="brandName" defaultValue={settings.brand_name} /></Field>
            <Field label="Contact email" name="contactEmail" hint="Shown in the footer; receives enquiries when no lister can."><TextInput name="contactEmail" type="email" defaultValue={settings.contact_email ?? ""} /></Field>
            <Field label="Contact phone" name="contactPhone"><TextInput name="contactPhone" defaultValue={settings.contact_phone ?? ""} /></Field>
            <Field label="WhatsApp number" name="contactWhatsapp"><TextInput name="contactWhatsapp" defaultValue={settings.contact_whatsapp ?? ""} /></Field>
          </div>

          <h2 className="mt-4 text-lg font-semibold">Regional defaults</h2>
          <div className={grid}>
            <Field label="Language / locale" name="defaultLocale" hint="BCP 47 code, e.g. en, en-GB, en-IN, fr-FR."><TextInput name="defaultLocale" defaultValue={settings.default_locale} /></Field>
            <Field label="Time zone" name="defaultTimezone" hint="IANA name, e.g. Europe/London, Asia/Kolkata."><TextInput name="defaultTimezone" defaultValue={settings.default_timezone} /></Field>
            <Field label="Default currency" name="defaultCurrency">
              <Select name="defaultCurrency" defaultValue={settings.default_currency ?? ""}>
                <option value="">Not set</option>
                {enabled.map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}
              </Select>
            </Field>
            <Field label="Default area unit" name="defaultAreaUnit">
              <Select name="defaultAreaUnit" defaultValue={settings.default_area_unit}>
                {Object.entries(AREA_UNIT_LABEL).map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}
              </Select>
            </Field>
          </div>

          <h2 className="mt-4 text-lg font-semibold">Listings and moderation</h2>
          <Checkbox name="selfServiceOwner" label="Members can turn on listing themselves (otherwise by invitation)" defaultChecked={settings.self_service_owner} />
          <Checkbox name="ownerLeadsEnabled" label="Owners receive enquiries for their own listings" defaultChecked={settings.owner_leads_enabled} />
          <Checkbox name="materialReview" label="Changing price, location, size, rooms or photos sends a live listing back to review" defaultChecked={settings.material_change_policy === "unpublish_until_review"} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="'New' badge for (days)" name="newListingDays"><TextInput name="newListingDays" inputMode="numeric" defaultValue={settings.new_listing_days} /></Field>
            <Field label="Max photos per listing" name="maxImages"><TextInput name="maxImages" inputMode="numeric" defaultValue={settings.max_images_per_listing} /></Field>
            <Field label="Max photo size (MB)" name="maxImageMb" hint="The storage bucket also caps uploads at 10 MB."><TextInput name="maxImageMb" inputMode="decimal" defaultValue={settings.max_image_bytes / 1048576} /></Field>
            <Field label="Comparison list size" name="comparisonMax"><TextInput name="comparisonMax" inputMode="numeric" defaultValue={settings.comparison_max} /></Field>
            <Field label="Enquiries per visitor per hour" name="enquiryLimit"><TextInput name="enquiryLimit" inputMode="numeric" defaultValue={settings.enquiry_limit_per_hour} /></Field>
            <Field label="Submissions per lister per day" name="submissionLimit"><TextInput name="submissionLimit" inputMode="numeric" defaultValue={settings.submission_limit_per_day} /></Field>
          </div>

          <h2 className="mt-4 text-lg font-semibold">Search engines</h2>
          <Field label="Default page title" name="seoTitle" hint="Up to 70 characters."><TextInput name="seoTitle" maxLength={70} defaultValue={settings.seo_default_title ?? ""} /></Field>
          <Field label="Default description" name="seoDescription" hint="Up to 170 characters."><TextArea name="seoDescription" maxLength={170} rows={2} defaultValue={settings.seo_default_description ?? ""} /></Field>
        </ActionForm>
      </Card>
    </div>
  );
}
