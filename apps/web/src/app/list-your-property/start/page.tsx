import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { WorkflowButtons } from "@/components/account-forms";
import { BoostPicker } from "@/components/boost-picker";
import { GoogleSignInButton } from "@/components/google-button";
import { Loading } from "@/components/loading";
import { PhotoManager } from "@/components/photo-manager";
import { QuickContactForm, QuickPropertyForm, QuickVideoLinkForm, ShootRequestForm } from "@/components/quick-listing-forms";
import { QuickVideoList } from "@/components/quick-video-list";
import { Alert, ButtonLink, Card, cx } from "@/components/ui";
import { VideoFileUpload } from "@/components/video-file-upload";
import { canList, getViewer } from "@/lib/auth";
import { getBoostPlans, getSiteSettings, getTaxonomy } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Post your property", robots: { index: false } };

const START = "/list-your-property/start";
const STEPS = ["Your details", "Property", "Photos & video", "Extras & submit"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function StartPage({ searchParams }: PageProps<"/list-your-property/start">) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <Suspense fallback={<Loading />}>
        {searchParams.then((params) => (
          <Wizard
            step={Number(typeof params.step === "string" ? params.step : "1") || 1}
            id={typeof params.id === "string" && UUID.test(params.id) ? params.id : null}
            edit={params.edit === "1"}
          />
        ))}
      </Suspense>
    </div>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Progress">
      {STEPS.map((label, index) => {
        const number = index + 1;
        const state = number < step ? "done" : number === step ? "current" : "todo";
        return (
          <li key={label} aria-current={state === "current" ? "step" : undefined} className="flex flex-col gap-1.5">
            <span className={cx("h-1.5 rounded-full", state === "todo" ? "bg-border" : state === "current" ? "bg-accent" : "bg-brand")} />
            <span className={cx("text-xs sm:text-sm", state === "current" ? "font-semibold text-text" : "text-text-muted")}>
              {number}. {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Shell({ step, title, description, children }: { step: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <>
      <Progress step={step} />
      <Card className="flex flex-col gap-5 p-5 sm:p-7">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {description ? <p className="mt-1 text-text-muted">{description}</p> : null}
        </div>
        {children}
      </Card>
    </>
  );
}

async function Wizard({ step, id, edit }: { step: number; id: string | null; edit: boolean }) {
  const viewer = await getViewer();

  // Step 1, signed out: create an account or sign in, then come back here.
  if (!viewer) {
    return (
      <Shell step={1} title="Post your property for free" description="Create a free account first. It takes a few seconds.">
        <div className="flex max-w-sm flex-col gap-3">
          <GoogleSignInButton next={START} />
          <ButtonLink href={`/sign-up?next=${encodeURIComponent(START)}`}>Sign up with email</ButtonLink>
          <p className="text-sm text-text-muted">
            Already have an account?{" "}
            <Link href={`/sign-in?next=${encodeURIComponent(START)}`} className="text-brand underline">
              Sign in
            </Link>
          </p>
        </div>
      </Shell>
    );
  }

  const supabase = await createUserClient();
  const { data: profile } = await supabase.from("profiles").select("display_name, phone").eq("id", viewer.id).maybeSingle();
  const hasPhone = Boolean(profile?.phone?.replace(/\D/g, "").length);

  if (!viewer.emailVerified) {
    return (
      <Shell step={1} title="Confirm your email" description="We sent you a link when you signed up.">
        <Alert tone="warning">Open the email from us and click the link, then come back to this page. Or sign in with Google instead.</Alert>
      </Shell>
    );
  }

  if (step <= 1 || !hasPhone || !canList(viewer)) {
    return (
      <Shell step={1} title="Your contact details" description="Buyers and tenants will call you on this number. Contact details are required.">
        <QuickContactForm name={profile?.display_name ?? viewer.displayName} phone={profile?.phone ?? ""} />
      </Shell>
    );
  }

  const [settings, taxonomy] = await Promise.all([getSiteSettings(), getTaxonomy()]);
  const listing = id
    ? (
        await supabase
          .from("listings")
          .select(
            "id, owner_id, agent_id, status, category, property_type_id, bedrooms, area_value, area_unit, price_amount, city_id, locality_id, furnishing, media:listing_media(id, upload_key, alt_text, is_cover, sort_order, kind), videos:listing_videos(provider, video_id, instagram_kind, sort_order), video_files:listing_video_files(id, storage_key, sort_order)",
          )
          .eq("id", id)
          .maybeSingle()
      ).data
    : null;
  const own = listing && (listing.owner_id === viewer.id || listing.agent_id === viewer.id);

  if (step === 2 || !listing || !own) {
    const cities = taxonomy.locations.filter((place) => place.level === "city");
    const localities = taxonomy.locations.filter((place) => place.level === "locality");
    const initial =
      listing && own && edit
        ? {
            purpose: listing.category === "rental" ? "rent" : "sale",
            propertyTypeId: listing.property_type_id ?? "",
            bedrooms: listing.bedrooms == null ? "" : String(listing.bedrooms),
            areaValue: listing.area_value == null ? "" : String(listing.area_value),
            areaUnit: listing.area_unit ?? settings.default_area_unit,
            priceAmount: listing.price_amount == null ? "" : String(listing.price_amount),
            cityId: listing.city_id ?? "",
            localityId: listing.locality_id ?? "",
            furnishing: listing.furnishing ?? "",
          }
        : undefined;
    return (
      <Shell step={2} title="Tell us about the property" description="Just the basics. You can add floor, parking, amenities and more later.">
        <QuickPropertyForm
          listingId={initial && listing ? listing.id : undefined}
          propertyTypes={taxonomy.propertyTypes.map((type) => ({ id: type.id, name: type.name }))}
          cities={cities}
          localities={localities}
          defaultAreaUnit={settings.default_area_unit}
          initial={initial}
        />
      </Shell>
    );
  }

  const editable = ["draft", "rejected", "published"].includes(listing.status);
  const photos = listing.media.filter((item) => item.kind === "image");

  if (step === 3) {
    return (
      <Shell step={3} title="Add photos and video" description="Properties with 5 or more photos get many more calls. Choose the best one as the cover.">
        <PhotoManager
          listingId={listing.id}
          initial={photos}
          editable={editable}
          isLive={listing.status === "published"}
          maxImages={settings.max_images_per_listing}
          maxBytes={settings.max_image_bytes}
          allowedTypes={settings.allowed_image_types}
        />
        <section className="flex flex-col gap-3 border-t border-border pt-5">
          <h2 className="font-semibold">Video (optional)</h2>
          <VideoFileUpload listingId={listing.id} files={[...listing.video_files].sort((a, b) => a.sort_order - b.sort_order)} editable={editable} />
          <QuickVideoList listingId={listing.id} videos={listing.videos} editable={editable} />
          {editable ? <QuickVideoLinkForm listingId={listing.id} /> : null}
        </section>
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <ButtonLink href={`${START}?step=4&id=${listing.id}`}>{photos.length ? "Continue" : "Skip for now"}</ButtonLink>
          <Link href={`${START}?step=2&id=${listing.id}&edit=1`} className="text-sm text-brand underline">
            Back
          </Link>
        </div>
      </Shell>
    );
  }

  // Step 4: shoot, boost, submit.
  const [{ data: shoots }, plans, { data: boosts }] = await Promise.all([
    supabase.from("shoot_requests").select("status, preferred_date, preferred_slot, scheduled_at").eq("listing_id", listing.id).in("status", ["requested", "confirmed"]),
    getBoostPlans(),
    supabase.from("listing_boosts").select("plan_name, status, ends_at").eq("listing_id", listing.id).in("status", ["paid", "active"]),
  ]);
  const openShoot = shoots?.[0];
  const hasCover = photos.some((photo) => photo.is_cover);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Shell step={4} title="Almost done" description="Optional extras, then send your property for a quick check.">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">📷 Professional photo &amp; video shoot</h2>
        {openShoot ? (
          <Alert tone="success">
            {openShoot.status === "confirmed" && openShoot.scheduled_at
              ? `Shoot confirmed for ${new Date(openShoot.scheduled_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: settings.default_timezone })}.`
              : `Shoot requested for ${openShoot.preferred_date} (${openShoot.preferred_slot}). Our team will call you to confirm.`}
          </Alert>
        ) : (
          <>
            <p className="text-sm text-text-muted">Our photographer visits at a time that suits you. The team calls you to confirm the time and any charges.</p>
            <ShootRequestForm listingId={listing.id} minDate={today} />
          </>
        )}
      </section>

      {plans.length ? (
        <section className="flex flex-col gap-3 border-t border-border pt-5">
          <h2 className="font-semibold">⚡ Boost your property</h2>
          {boosts?.length ? (
            <Alert tone="success">
              {boosts.map((boost) =>
                boost.status === "active" && boost.ends_at
                  ? `${boost.plan_name}: featured until ${new Date(boost.ends_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}. `
                  : `${boost.plan_name}: paid, starts when your property is approved. `,
              )}
            </Alert>
          ) : null}
          <p className="text-sm text-text-muted">Show at the top of search results with a Featured badge. Optional: you can boost later from My listings.</p>
          <BoostPicker listingId={listing.id} plans={plans} brandName={settings.brand_name} isLive={listing.status === "published"} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3 border-t border-border pt-5">
        <h2 className="font-semibold">Send for review</h2>
        {listing.status === "draft" || listing.status === "rejected" ? (
          <>
            {!hasCover ? (
              <Alert tone="warning">
                Add at least one photo first.{" "}
                <Link href={`${START}?step=3&id=${listing.id}`} className="underline">
                  Add photos
                </Link>
              </Alert>
            ) : (
              <p className="text-sm text-text-muted">Our team checks every property to keep the site free of fake ads. Most go live within a day.</p>
            )}
            <WorkflowButtons listingId={listing.id} actions={[{ action: "submit", label: "Submit for review", variant: "primary" }]} />
          </>
        ) : (
          <Alert tone="success">
            {listing.status === "published" ? "Your property is live." : "Your property is with our team for review. We'll let you know as soon as it's live."}
          </Alert>
        )}
        <p className="text-sm">
          <Link href={`/account/listings/${listing.id}`} className="text-brand underline">
            Add full details
          </Link>{" "}
          (floor, parking, amenities, exact address, brochure) or{" "}
          <Link href="/account/listings" className="text-brand underline">
            go to My listings
          </Link>
          .
        </p>
      </section>
    </Shell>
  );
}
