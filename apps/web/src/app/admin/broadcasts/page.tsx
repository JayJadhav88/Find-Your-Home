import { formatDateTime } from "@fyh/shared";
import { Suspense } from "react";
import { cancelBroadcast, createBroadcast } from "@/app/actions/admin-messaging";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Badge, Card, Checkbox, Field, PageHeader, Select, TextArea, TextInput } from "@/components/ui";
import { requireBroadcastTeam } from "@/lib/auth";
import { getSiteSettings, getTaxonomy } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

const AUDIENCES = [
  ["everyone", "Everyone"],
  ["owners", "Owners, agents and builders"],
  ["buyers", "Members who don't list"],
  ["builders", "Builders"],
  ["team", "Our team (for testing)"],
] as const;

const CHANNEL_LABEL: Record<string, string> = { email: "Email", push: "Phone & browser", whatsapp: "WhatsApp", in_app: "In the app" };

export default function BroadcastsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Broadcasts />
    </Suspense>
  );
}

async function Broadcasts() {
  await requireBroadcastTeam("/admin/broadcasts");
  const supabase = await createUserClient();
  const [settings, taxonomy, { data: broadcasts }, sizes] = await Promise.all([
    getSiteSettings(),
    getTaxonomy(),
    supabase.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(30),
    Promise.all(
      AUDIENCES.map(async ([value]) => {
        const { data } = await supabase.rpc("admin_broadcast_audience_size", { p_audience: value });
        return [value, data?.[0]] as const;
      }),
    ),
  ]);
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };
  const cities = taxonomy.locations.filter((location) => location.level === "city");
  const sizeOf = Object.fromEntries(sizes);
  const reports = await Promise.all(
    (broadcasts ?? [])
      .filter((item) => item.status === "sent")
      .slice(0, 10)
      .map(async (item) => [item.id, (await supabase.rpc("admin_broadcast_report", { p_id: item.id })).data ?? []] as const),
  );
  const reportOf = new Map(reports);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Send a message"
        description="Everyone in the audience sees it in the app. Email, phone and WhatsApp only reach people who agreed to news, at most a few times a week, and wait for quiet hours to end."
      />

      <Card>
        <ActionForm action={createBroadcast} submitLabel="Send" resetOnSuccess>
          <Field label="Title" name="title" required hint="Up to 80 characters.">
            <TextInput name="title" maxLength={80} />
          </Field>
          <Field label="Message" name="body" required hint="Up to 500 characters.">
            <TextArea name="body" rows={4} maxLength={500} />
          </Field>
          <Field label="Link (optional)" name="url" hint="A page on this site, e.g. /search?category=new_project, or an https:// link.">
            <TextInput name="url" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Audience" name="audience">
              <Select name="audience" defaultValue="everyone">
                {AUDIENCES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                    {sizeOf[value] ? ` (${sizeOf[value].total}, ${sizeOf[value].accepts_news} accept news)` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Only people interested in a city (optional)" name="cityId" hint="People who list, saved or asked about a home there.">
              <Select name="cityId" defaultValue="">
                <option value="">Any city</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </Select>
            </Field>
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Also send by (in-app is always on)</legend>
            <Checkbox name="channels" value="push" label="Phone and browser notifications" defaultChecked />
            <Checkbox name="channels" value="email" label="Email" />
            <Checkbox name="channels" value="whatsapp" label="WhatsApp (needs an approved news template)" />
          </fieldset>
          <Field label="Send later (optional)" name="scheduledAt" hint={`Date and time in ${settings.default_timezone}. Leave empty to send now.`}>
            <TextInput name="scheduledAt" type="datetime-local" />
          </Field>
        </ActionForm>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recent messages</h2>
        {broadcasts?.length ? (
          broadcasts.map((item) => {
            const report = reportOf.get(item.id) ?? [];
            const count = (channel: string, status: string) => report.find((row) => row.channel === channel && row.status === status)?.total ?? 0;
            const channels = [...new Set(report.filter((row) => row.channel !== "in_app").map((row) => row.channel))];
            return (
              <Card key={item.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{item.title}</p>
                  <Badge tone={item.status === "sent" ? "published" : item.status === "cancelled" ? "archived" : "pending_review"}>{item.status}</Badge>
                </div>
                <p className="text-sm">{item.body}</p>
                <p className="text-xs text-text-muted">
                  {AUDIENCES.find(([value]) => value === item.audience)?.[1]} ·{" "}
                  {item.status === "sent" && item.sent_at
                    ? `sent ${formatDateTime(item.sent_at, fmt)} to ${item.recipients ?? 0} member(s)`
                    : `scheduled for ${formatDateTime(item.scheduled_at, fmt)}`}
                  {item.channels.length ? ` · ${item.channels.map((channel) => CHANNEL_LABEL[channel]).join(", ")}` : " · in-app only"}
                </p>
                {item.status === "sent" ? (
                  <p className="text-sm">
                    In the app: {count("in_app", "delivered")} delivered, {count("in_app", "read")} read
                    {channels.map((channel) => (
                      <span key={channel}>
                        {" "}· {CHANNEL_LABEL[channel]}: {count(channel, "sent")} sent
                        {count(channel, "pending") ? `, ${count(channel, "pending")} waiting` : ""}
                        {count(channel, "failed") ? `, ${count(channel, "failed")} failed` : ""}
                      </span>
                    ))}
                  </p>
                ) : null}
                {item.status === "scheduled" ? (
                  <ActionForm action={cancelBroadcast} submitLabel="Cancel" submitAriaLabel={`Cancel ${item.title}`} variant="ghost" inline confirm="Cancel this scheduled message?">
                    <input type="hidden" name="id" value={item.id} />
                  </ActionForm>
                ) : null}
              </Card>
            );
          })
        ) : (
          <p className="text-sm text-text-muted">No messages yet.</p>
        )}
      </section>
    </div>
  );
}
