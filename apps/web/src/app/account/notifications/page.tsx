import { describeNotification, formatDateTime, notificationWebHref, WHATSAPP_CONSENT_TEXT } from "@fyh/shared";
import { Suspense } from "react";
import { markAllNotificationsRead, openNotification, saveNotificationPreferences, saveTeamAlerts } from "@/app/actions/notifications";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Button, Card, Checkbox, cx, EmptyState, Field, PageHeader, TextInput } from "@/components/ui";
import { WebPushToggle } from "@/components/web-push-toggle";
import { canManageEnquiries, isStaff, requireViewer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";

const ALERT_OPTIONS = [
  ["in_app", "In the app"],
  ["email", "Email"],
  ["push", "Phone and browser"],
  ["whatsapp", "WhatsApp"],
] as const;

export default function NotificationsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Notifications />
    </Suspense>
  );
}

async function Notifications() {
  const viewer = await requireViewer("/account/notifications");
  const supabase = await createUserClient();
  const [settings, { data: items }, { data: prefs }] = await Promise.all([
    getSiteSettings(),
    supabase.from("notifications").select("id, kind, data, read_at, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("notification_preferences").select("*").eq("user_id", viewer.id).maybeSingle(),
  ]);
  const fmt = { locale: settings.default_locale, timeZone: prefs?.timezone ?? settings.default_timezone };
  const unread = (items ?? []).filter((item) => !item.read_at).length;
  const timeZones = Intl.supportedValuesOf("timeZone");
  const webPushKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={
          unread ? (
            <form action={markAllNotificationsRead}>
              <Button type="submit" variant="secondary">Mark all as read</Button>
            </form>
          ) : null
        }
      />

      {items?.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const text = describeNotification(item.kind, item.data as Record<string, unknown>);
            const href = notificationWebHref(text.target);
            const external = href?.startsWith("https://");
            const content = (
              <>
                <span className="flex items-center gap-2 font-semibold">
                  {!item.read_at ? <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
                  {text.title}
                </span>
                {text.body ? <span className="text-sm text-text-muted">{text.body}</span> : null}
                <span className="text-xs text-text-muted">{formatDateTime(item.created_at, fmt)}</span>
              </>
            );
            const rowClass = cx(
              "flex w-full flex-col items-start gap-1 rounded-xl border border-border p-4 text-left",
              item.read_at ? "bg-surface" : "bg-brand-soft",
            );
            return (
              <li key={item.id}>
                {external ? (
                  <a href={href ?? undefined} target="_blank" rel="noopener noreferrer" className={cx(rowClass, "hover:border-brand")}>
                    {content}
                  </a>
                ) : (
                  <form action={openNotification}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className={cx(rowClass, "cursor-pointer hover:border-brand")}>
                      {content}
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No notifications yet">Listing decisions, enquiries and visit updates will show up here.</EmptyState>
      )}

      <Card>
        <h2 className="text-lg font-semibold">How we contact you</h2>
        <p className="mb-4 mt-1 text-sm text-text-muted">
          Notifications always appear here. Choose where else you want them.
        </p>
        {webPushKey ? (
          <div className="mb-4 border-b border-border pb-4">
            <WebPushToggle publicKey={webPushKey} />
          </div>
        ) : null}
        <ActionForm action={saveNotificationPreferences} submitLabel="Save notification settings">
          <Checkbox name="emailEnabled" label={`Email (${viewer.email})`} defaultChecked={prefs?.email_enabled ?? true} />
          <Checkbox name="pushEnabled" label="Phone and browser notifications" defaultChecked={prefs?.push_enabled ?? true} />
          <Checkbox name="whatsappEnabled" label={WHATSAPP_CONSENT_TEXT} defaultChecked={prefs?.whatsapp_enabled ?? false} />
          <Field label="WhatsApp number" name="whatsappNumber" hint="With country code, e.g. +91 98765 43210.">
            <TextInput name="whatsappNumber" type="tel" autoComplete="tel" defaultValue={prefs?.whatsapp_number ?? ""} />
          </Field>
          <Checkbox name="alertsEnabled" label="Alerts for my saved searches" defaultChecked={prefs?.alerts_enabled ?? true} />
          <Checkbox
            name="quietHoursEnabled"
            label={`Quiet hours: hold news and alerts from ${settings.quiet_start_hour}:00 to ${settings.quiet_end_hour}:00`}
            defaultChecked={prefs?.quiet_hours_enabled ?? true}
          />
          <Field label="Time zone" name="timezone" hint={`Leave empty to use ${settings.default_timezone}.`}>
            <TextInput name="timezone" list="time-zones" defaultValue={prefs?.timezone ?? ""} autoComplete="off" />
          </Field>
          <datalist id="time-zones">
            {timeZones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          {prefs?.whatsapp_opt_in_at ? (
            <p className="text-xs text-text-muted">
              WhatsApp consent recorded {formatDateTime(prefs.whatsapp_opt_in_at, fmt)}.
            </p>
          ) : null}
        </ActionForm>
      </Card>

      {canManageEnquiries(viewer) || isStaff(viewer) ? (
        <Card>
          <h2 className="text-lg font-semibold">Team alerts</h2>
          <p className="mb-4 mt-1 text-sm text-text-muted">
            How you hear about new work. WhatsApp needs your number and consent above; phone and browser alerts need notifications turned on.
          </p>
          <ActionForm action={saveTeamAlerts} submitLabel="Save team alerts">
            {canManageEnquiries(viewer) ? (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-medium">New enquiries and visit requests</legend>
                {ALERT_OPTIONS.map(([value, label]) => (
                  <Checkbox key={value} name="enquiryAlerts" value={value} label={label} defaultChecked={(prefs?.enquiry_alerts ?? []).includes(value)} />
                ))}
              </fieldset>
            ) : null}
            {isStaff(viewer) ? (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-medium">Listings waiting for review</legend>
                {ALERT_OPTIONS.map(([value, label]) => (
                  <Checkbox key={value} name="reviewAlerts" value={value} label={label} defaultChecked={(prefs?.review_alerts ?? []).includes(value)} />
                ))}
              </fieldset>
            ) : null}
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}
