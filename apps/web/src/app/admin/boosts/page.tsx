import { formatDateTime } from "@fyh/shared";
import Link from "next/link";
import { Suspense } from "react";
import { saveBoostPlan, updateShoot } from "@/app/actions/admin-boosts";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Badge, Card, Checkbox, EmptyState, PageHeader, Select, TextInput } from "@/components/ui";
import { isAdmin, requireStaff } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

const SLOT: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening" };
const SHOOT_STATUS: Record<string, string> = { requested: "New request", confirmed: "Confirmed", done: "Done", cancelled: "Cancelled" };
const BOOST_STATUS: Record<string, string> = { created: "Not paid", paid: "Paid, waiting to go live", active: "Running", expired: "Finished", failed: "Failed", refunded: "Refunded" };

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function BoostsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Boosts />
    </Suspense>
  );
}

async function Boosts() {
  const viewer = await requireStaff("/admin/boosts");
  const admin = isAdmin(viewer);
  const supabase = await createUserClient();
  const [settings, { data: shoots }, { data: plans }, { data: boosts }] = await Promise.all([
    getSiteSettings(),
    supabase
      .from("shoot_requests")
      .select("id, status, contact_name, contact_phone, preferred_date, preferred_slot, notes, scheduled_at, team_note, created_at, listing:listings(id, title, reference_code)")
      .order("status")
      .order("preferred_date")
      .limit(100),
    supabase.from("boost_plans").select("*").order("sort_order").order("price_paise"),
    supabase
      .from("listing_boosts")
      .select("id, plan_name, amount_paise, status, paid_at, ends_at, razorpay_payment_id, created_at, listing:listings(id, title, reference_code)")
      .neq("status", "created")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };
  const open = (shoots ?? []).filter((shoot) => shoot.status === "requested" || shoot.status === "confirmed");
  const closed = (shoots ?? []).filter((shoot) => shoot.status === "done" || shoot.status === "cancelled");
  const localInput = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("sv-SE", { timeZone: settings.default_timezone }).slice(0, 16).replace(" ", "T")
      : "";
  const paidTotal = (boosts ?? []).filter((boost) => ["paid", "active", "expired"].includes(boost.status)).reduce((sum, boost) => sum + boost.amount_paise, 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Boosts & shoots" description="Professional shoot requests from owners, boost payments and boost prices." />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Shoot requests ({open.length} open)</h2>
        {open.length ? (
          <ul className="flex flex-col gap-3">
            {open.map((shoot) => (
              <li key={shoot.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={shoot.status === "requested" ? "pending_review" : "published"}>{SHOOT_STATUS[shoot.status]}</Badge>
                    {shoot.listing ? (
                      <Link href={`/admin/listings/${shoot.listing.id}`} className="font-semibold underline">
                        {shoot.listing.title} ({shoot.listing.reference_code})
                      </Link>
                    ) : null}
                  </div>
                  <p className="text-sm">
                    {shoot.contact_name} ·{" "}
                    <a href={`tel:${shoot.contact_phone}`} className="text-brand underline">
                      {shoot.contact_phone}
                    </a>{" "}
                    · wants {shoot.preferred_date} ({SLOT[shoot.preferred_slot]})
                    {shoot.scheduled_at ? ` · booked for ${formatDateTime(shoot.scheduled_at, fmt)}` : ""}
                  </p>
                  {shoot.notes ? <p className="text-sm text-text-muted">Owner&rsquo;s note: {shoot.notes}</p> : null}
                  {shoot.team_note ? <p className="text-sm text-text-muted">Team note: {shoot.team_note}</p> : null}
                  <ActionForm action={updateShoot} submitLabel="Update" inline>
                    <input type="hidden" name="id" value={shoot.id} />
                    <label className="flex flex-col gap-1 text-sm">
                      Status
                      <Select name="status" bare defaultValue={shoot.status === "requested" ? "confirmed" : shoot.status}>
                        <option value="requested">New request</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="done">Done</option>
                        <option value="cancelled">Cancelled</option>
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      Date and time
                      <TextInput name="scheduledAt" bare type="datetime-local" defaultValue={localInput(shoot.scheduled_at)} />
                    </label>
                    <label className="flex flex-1 flex-col gap-1 text-sm">
                      Team note
                      <TextInput name="note" bare placeholder="Photographer, charges…" />
                    </label>
                  </ActionForm>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No open shoot requests">Owners ask for a shoot in the last step of List your property.</EmptyState>
        )}
        {closed.length ? (
          <details>
            <summary className="cursor-pointer text-sm text-brand underline">Done and cancelled ({closed.length})</summary>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {closed.map((shoot) => (
                <li key={shoot.id}>
                  {SHOOT_STATUS[shoot.status]} · {shoot.listing?.title ?? "property removed"} · {shoot.contact_name}
                  {shoot.scheduled_at ? ` · ${formatDateTime(shoot.scheduled_at, fmt)}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Boost payments</h2>
        <p className="text-sm text-text-muted">Received so far (last 100): {rupees(paidTotal)}. Refunds are made in the Razorpay dashboard.</p>
        {boosts?.length ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="p-2">Property</th>
                  <th className="p-2">Plan</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Paid</th>
                  <th className="p-2">Ends</th>
                  <th className="p-2">Payment id</th>
                </tr>
              </thead>
              <tbody>
                {boosts.map((boost) => (
                  <tr key={boost.id} className="border-t border-border">
                    <td className="p-2">
                      {boost.listing ? (
                        <Link href={`/admin/listings/${boost.listing.id}`} className="underline">
                          {boost.listing.reference_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2">{boost.plan_name}</td>
                    <td className="p-2">{rupees(boost.amount_paise)}</td>
                    <td className="p-2">{BOOST_STATUS[boost.status] ?? boost.status}</td>
                    <td className="p-2">{boost.paid_at ? formatDateTime(boost.paid_at, fmt) : "—"}</td>
                    <td className="p-2">{boost.ends_at ? formatDateTime(boost.ends_at, fmt) : "—"}</td>
                    <td className="p-2 font-mono text-xs">{boost.razorpay_payment_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No boost payments yet" />
        )}
      </section>

      {admin ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Boost plans and prices</h2>
          <p className="text-sm text-text-muted">Owners see active plans on List your property and can pay online. Prices in rupees.</p>
          {[...(plans ?? []), null].map((plan) => (
            <Card key={plan?.id ?? "new"}>
              <ActionForm action={saveBoostPlan} submitLabel={plan ? "Save" : "Add plan"} inline resetOnSuccess={!plan}>
                <input type="hidden" name="id" value={plan?.id ?? ""} />
                <label className="flex flex-col gap-1 text-sm">
                  Name
                  <TextInput name="name" bare defaultValue={plan?.name ?? ""} placeholder="Boost 15 days" />
                </label>
                <label className="flex w-24 flex-col gap-1 text-sm">
                  Days
                  <TextInput name="days" bare type="number" min={1} max={365} defaultValue={plan?.days ?? ""} />
                </label>
                <label className="flex w-32 flex-col gap-1 text-sm">
                  Price (₹)
                  <TextInput name="price" bare type="number" min={1} step="1" defaultValue={plan ? plan.price_paise / 100 : ""} />
                </label>
                <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
                  Short description
                  <TextInput name="description" bare defaultValue={plan?.description ?? ""} placeholder="Top of search for two weeks" />
                </label>
                <label className="flex w-20 flex-col gap-1 text-sm">
                  Order
                  <TextInput name="sortOrder" bare type="number" defaultValue={plan?.sort_order ?? 0} />
                </label>
                <Checkbox name="isActive" label="Active" defaultChecked={plan ? plan.is_active : true} />
              </ActionForm>
            </Card>
          ))}
          <p className="text-sm text-text-muted">
            Payments need the Razorpay keys set up on the server. Until then owners see &ldquo;Online payment isn&rsquo;t set up yet&rdquo;.
          </p>
        </section>
      ) : null}
    </div>
  );
}
