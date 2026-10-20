import { utcToZonedLocal } from "@fyh/shared";
import { Suspense } from "react";
import { deleteBanner, saveBanner, saveFloatingAction, setFeatureFlag } from "@/app/actions/admin-site";
import { ActionForm } from "@/components/action-form";
import { ImageUploadField } from "@/components/image-upload-field";
import { Loading } from "@/components/loading";
import { Badge, Card, Checkbox, Field, PageHeader, Select, TextInput } from "@/components/ui";
import { isAdmin, requireContentTeam } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  cta_label: string | null;
  target_url: string | null;
  audience: string;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  is_active: boolean;
};

const ICONS = [
  ["whatsapp", "WhatsApp"],
  ["phone", "Phone"],
  ["chat", "Chat"],
  ["calendar", "Book a visit"],
  ["home", "Home"],
  ["offer", "Offer"],
  ["video", "Video"],
] as const;

export default function SiteContentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SiteContent />
    </Suspense>
  );
}

async function SiteContent() {
  const viewer = await requireContentTeam("/admin/site");
  const supabase = await createUserClient();
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() - 29)).toISOString().slice(0, 10);
  const [settings, { data: banners }, { data: floating }, { data: clicks }, { data: flags }] = await Promise.all([
    getSiteSettings(),
    supabase.from("banners").select("*").order("sort_order").order("created_at", { ascending: false }),
    supabase.from("floating_action").select("*").single(),
    supabase.from("link_clicks").select("link_key, clicks").gte("day", since),
    supabase.from("feature_flags").select("*").order("label"),
  ]);
  const clicksFor = (key: string) => (clicks ?? []).filter((row) => row.link_key === key).reduce((sum, row) => sum + row.clicks, 0);
  const local = (value: string | null) => (value ? utcToZonedLocal(value, settings.default_timezone) : "");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Site content" description="Home banners, the floating button and feature switches. Changes show within a few minutes, with no app update needed." />

      <section className="flex flex-col gap-4" aria-labelledby="banners-heading">
        <h2 id="banners-heading" className="text-xl font-semibold">Home banners</h2>
        <Card>
          <h3 className="mb-3 font-semibold">Add a banner</h3>
          <BannerForm timeZone={settings.default_timezone} />
        </Card>
        {((banners ?? []) as Banner[]).map((banner) => (
          <Card key={banner.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{banner.title}</p>
              <span className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
                {banner.is_active ? <Badge tone="published">on</Badge> : <Badge tone="archived">off</Badge>}
                {banner.audience === "all" ? "website and app" : banner.audience === "web" ? "website only" : "app only"} ·{" "}
                {clicksFor(`banner:${banner.id}`)} clicks in 30 days
              </span>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-brand">Edit</summary>
              <div className="mt-3 flex flex-col gap-3">
                <BannerForm banner={banner} timeZone={settings.default_timezone} starts={local(banner.starts_at)} ends={local(banner.ends_at)} />
                <ActionForm action={deleteBanner} submitLabel="Delete banner" variant="danger" inline confirm="Delete this banner?">
                  <input type="hidden" name="id" value={banner.id} />
                </ActionForm>
              </div>
            </details>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="floating-heading">
        <h2 id="floating-heading" className="text-xl font-semibold">Floating button</h2>
        <Card>
          <p className="mb-3 text-sm text-text-muted">
            A button that stays in the corner of every page, e.g. “Chat on WhatsApp” linking to https://wa.me/91XXXXXXXXXX.
            {floating ? ` ${clicksFor("floating")} clicks in 30 days.` : ""}
          </p>
          <ActionForm action={saveFloatingAction} submitLabel="Save floating button">
            <Checkbox name="isActive" label="Show the floating button" defaultChecked={floating?.is_active ?? false} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Label" name="label">
                <TextInput name="label" defaultValue={floating?.label ?? "Chat with us"} maxLength={40} />
              </Field>
              <Field label="Link" name="targetUrl" hint="https://wa.me/91…, tel:+91…, a page like /contact, or an https:// address.">
                <TextInput name="targetUrl" defaultValue={floating?.target_url ?? ""} />
              </Field>
              <Field label="Icon" name="icon">
                <Select name="icon" defaultValue={floating?.icon ?? "whatsapp"}>
                  {ICONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Position" name="position">
                <Select name="position" defaultValue={floating?.position ?? "right"}>
                  <option value="right">Bottom right</option>
                  <option value="left">Bottom left</option>
                </Select>
              </Field>
            </div>
          </ActionForm>
        </Card>
      </section>

      {isAdmin(viewer) ? (
        <section className="flex flex-col gap-4" aria-labelledby="flags-heading">
          <h2 id="flags-heading" className="text-xl font-semibold">Feature switches</h2>
          <p className="text-sm text-text-muted">Switch future modules on or off for everyone. Changes are recorded in the audit log.</p>
          <ul className="flex flex-col gap-2">
            {(flags ?? []).map((flag) => (
              <li key={flag.key}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {flag.label} {flag.enabled ? <Badge tone="published">on</Badge> : <Badge tone="archived">off</Badge>}
                    </p>
                    <p className="text-sm text-text-muted">{flag.description}</p>
                  </div>
                  <ActionForm action={setFeatureFlag} submitLabel={flag.enabled ? "Switch off" : "Switch on"} submitAriaLabel={`${flag.enabled ? "Switch off" : "Switch on"} ${flag.label}`} variant="secondary" inline>
                    <input type="hidden" name="key" value={flag.key} />
                    <input type="hidden" name="enabled" value={flag.enabled ? "0" : "1"} />
                  </ActionForm>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function BannerForm({ banner, timeZone, starts, ends }: { banner?: Banner; timeZone: string; starts?: string; ends?: string }) {
  const id = (field: string) => (banner ? `${field}-${banner.id}` : field);
  return (
    <ActionForm action={saveBanner} submitLabel={banner ? "Save banner" : "Add banner"} resetOnSuccess={!banner}>
      <input type="hidden" name="id" value={banner?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" name={id("title")}>
          <TextInput name="title" id={id("title")} defaultValue={banner?.title} maxLength={80} />
        </Field>
        <Field label="Subtitle" name={id("subtitle")}>
          <TextInput name="subtitle" id={id("subtitle")} defaultValue={banner?.subtitle ?? ""} maxLength={160} />
        </Field>
        <Field label="Button text" name={id("ctaLabel")}>
          <TextInput name="ctaLabel" id={id("ctaLabel")} defaultValue={banner?.cta_label ?? ""} maxLength={30} placeholder="Learn more" />
        </Field>
        <Field label="Button link" name={id("targetUrl")} hint="A page like /search?category=new_project or an https:// address.">
          <TextInput name="targetUrl" id={id("targetUrl")} defaultValue={banner?.target_url ?? ""} />
        </Field>
        <Field label="Image (optional)" name={id("imageUrl")}>
          <ImageUploadField name="imageUrl" id={id("imageUrl")} defaultValue={banner?.image_url ?? ""} />
        </Field>
        <Field label="Show on" name={id("audience")}>
          <Select name="audience" id={id("audience")} defaultValue={banner?.audience ?? "all"}>
            <option value="all">Website and app</option>
            <option value="web">Website only</option>
            <option value="app">App only</option>
          </Select>
        </Field>
        <Field label="Start (optional)" name={id("startsAt")} hint={`In ${timeZone}.`}>
          <TextInput name="startsAt" id={id("startsAt")} type="datetime-local" defaultValue={starts ?? ""} />
        </Field>
        <Field label="End (optional)" name={id("endsAt")}>
          <TextInput name="endsAt" id={id("endsAt")} type="datetime-local" defaultValue={ends ?? ""} />
        </Field>
        <Field label="Order" name={id("sortOrder")} hint="Lower numbers show first.">
          <TextInput name="sortOrder" id={id("sortOrder")} inputMode="numeric" defaultValue={banner?.sort_order ?? 0} />
        </Field>
      </div>
      <Checkbox name="isActive" label="Show this banner" defaultChecked={banner?.is_active ?? true} />
    </ActionForm>
  );
}
