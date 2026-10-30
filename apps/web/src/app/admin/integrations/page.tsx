import { formatDateTime } from "@fyh/shared";
import { Suspense, type ReactNode } from "react";
import {
  createSheetsSecret,
  removeIntegrationKey,
  saveSheetsIntegration,
  syncAllEnquiriesToSheet,
  saveEmailIntegration,
  savePushIntegration,
  saveWhatsAppIntegration,
  sendIntegrationTest,
} from "@/app/actions/admin-messaging";
import { newCalendarLink, saveMapsIntegration, savePaymentIntegration, saveSmsIntegration } from "@/app/actions/admin-integrations";
import { ActionForm } from "@/components/action-form";
import { Loading } from "@/components/loading";
import { Badge, Card, Checkbox, Field, PageHeader, Select, TextInput } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { SHEETS_APPS_SCRIPT } from "@/lib/sheets-script";
import { getSiteSettings } from "@/lib/public-data";
import { createUserClient } from "@/lib/supabase";
import { PasswordInput } from "@/components/password-input";

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Integrations />
    </Suspense>
  );
}

type TemplateMap = Record<string, { name?: string; language?: string } | undefined>;

async function Integrations() {
  await requireAdmin("/admin/integrations");
  const supabase = await createUserClient();
  const [settings, { data: config }, { data: secrets }, { data: log }] = await Promise.all([
    getSiteSettings(),
    supabase.from("integration_settings").select("*").single(),
    supabase.rpc("admin_integration_secrets"),
    supabase
      .from("notification_outbox")
      .select("id, channel, template, status, attempts, last_error, created_at, sent_at")
      .order("id", { ascending: false })
      .limit(25),
  ]);
  if (!config) return <p>Integration settings unavailable.</p>;
  const fmt = { locale: settings.default_locale, timeZone: settings.default_timezone };
  const secret = (name: string) => (secrets ?? []).find((row) => row.name === name);
  const templates = (config.whatsapp_templates ?? {}) as TemplateMap;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Integrations"
        description="Payments, SMS codes, maps, calendar, email, WhatsApp and push. Keys are stored encrypted and can't be viewed again, only replaced or removed."
      />

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Online payments (Razorpay)</h2>
        <p className="text-sm text-text-muted">
          Used for Boost. In the Razorpay dashboard: Account &amp; Settings → API Keys. Start with Test Mode keys (rzp_test_…) and
          switch to Live keys after Razorpay activates your account. Webhook (recommended): add{" "}
          <code className="break-all">{`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/boost-payment`}</code> with the event{" "}
          <code>order.paid</code> and a secret of your choice, then paste that secret below.
        </p>
        <KeyStatus label="Key Secret" secret={secret("razorpay_key_secret")} name="razorpay_key_secret" fmt={fmt} />
        <KeyStatus label="Webhook secret" secret={secret("razorpay_webhook_secret")} name="razorpay_webhook_secret" fmt={fmt} />
        <ActionForm action={savePaymentIntegration} submitLabel="Save payment settings">
          <Checkbox name="paymentsEnabled" label="Take payments online" defaultChecked={config.payments_enabled} />
          <Field label="Key Id" name="razorpayKeyId" hint="Starts with rzp_test_ or rzp_live_. This one is not secret.">
            <TextInput name="razorpayKeyId" defaultValue={config.razorpay_key_id ?? ""} placeholder="rzp_test_…" autoComplete="off" />
          </Field>
          <Field label="New Key Secret" name="razorpayKeySecret" hint="Leave empty to keep the saved secret.">
            <PasswordInput name="razorpayKeySecret" autoComplete="off" />
          </Field>
          <Field label="New webhook secret" name="razorpayWebhookSecret" hint="Leave empty to keep the saved secret.">
            <PasswordInput name="razorpayWebhookSecret" autoComplete="off" />
          </Field>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">SMS one-time codes (OTP)</h2>
        <p className="text-sm text-text-muted">
          For sign-in with a mobile number and to verify phone numbers in the lead pop-up. In India the sender id and the OTP
          message template must first be approved on DLT (your SMS provider helps with this). Template example:
          &ldquo;{"{#var#}"} is your Find Your Home verification code. It is valid for 10 minutes.&rdquo;
        </p>
        <KeyStatus label="SMS API key" secret={secret("sms_api_key")} name="sms_api_key" fmt={fmt} />
        <ActionForm action={saveSmsIntegration} submitLabel="Save SMS settings">
          <Field label="Provider" name="smsProvider">
            <Select name="smsProvider" defaultValue={config.sms_provider ?? ""}>
              <option value="">Not set up</option>
              <option value="msg91">MSG91</option>
              <option value="2factor">2Factor.in</option>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sender id (DLT header)" name="smsSenderId" hint="6 capital letters, e.g. FYHOME.">
              <TextInput name="smsSenderId" defaultValue={config.sms_sender_id ?? ""} maxLength={6} />
            </Field>
            <Field label="OTP template id" name="smsTemplateId" hint="MSG91: the template id. 2Factor: the template name (optional).">
              <TextInput name="smsTemplateId" defaultValue={config.sms_template_id ?? ""} />
            </Field>
          </div>
          <Field label="New API key" name="smsApiKey" hint="MSG91: Authkey. 2Factor: API key. Leave empty to keep the saved key.">
            <PasswordInput name="smsApiKey" autoComplete="off" />
          </Field>
          <Checkbox name="otpSignIn" label="Let people sign in and sign up with their mobile number" defaultChecked={config.otp_sign_in_enabled} />
          <Checkbox name="otpLeads" label="Verify the phone number by SMS in the lead pop-up (fewer fake leads, small cost per SMS)" defaultChecked={config.otp_leads_enabled} />
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Maps</h2>
        <p className="text-sm text-text-muted">
          OpenStreetMap is free and needs no key. Google Maps needs a browser key from Google Cloud (Maps Embed API), restricted to
          your website address. Google includes a monthly free allowance.
        </p>
        <ActionForm action={saveMapsIntegration} submitLabel="Save map settings">
          <Field label="Map provider" name="mapsProvider">
            <Select name="mapsProvider" defaultValue={config.maps_provider}>
              <option value="osm">OpenStreetMap (free)</option>
              <option value="google">Google Maps</option>
            </Select>
          </Field>
          <Field label="Google Maps browser key" name="googleMapsKey" hint="Starts with AIza. Visitors can see it, so restrict it to your site in Google Cloud.">
            <TextInput name="googleMapsKey" defaultValue={config.google_maps_key ?? ""} autoComplete="off" />
          </Field>
        </ActionForm>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Team calendar</h2>
        <p className="text-sm text-text-muted">
          Visits, confirmed shoots and callbacks are in{" "}
          <a href="/admin/calendar" className="text-brand underline">
            Admin → Calendar
          </a>
          . To see them in Google Calendar as well, make a private link and add it in Google Calendar → Other calendars → + → From
          URL. Anyone with the link can see the events, so share it only with the team. Making a new link stops the old one.
        </p>
        <p className="text-sm">Link: {config.calendar_token_hash ? <Badge tone="published">made</Badge> : <Badge>not made yet</Badge>}</p>
        <ActionForm
          action={newCalendarLink}
          submitLabel={config.calendar_token_hash ? "Make a new link" : "Make the link"}
          variant="secondary"
          confirm={config.calendar_token_hash ? "Make a new link? The old one stops working." : undefined}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Email (Resend)</h2>
        <p className="text-sm text-text-muted">
          Create a key at resend.com with “sending access”, and verify your domain there so emails don&rsquo;t land in spam.
        </p>
        <KeyStatus label="Resend API key" secret={secret("resend_api_key")} name="resend_api_key" fmt={fmt} />
        <ActionForm action={saveEmailIntegration} submitLabel="Save email settings">
          <Field label="Send from" name="emailFrom" hint="e.g. Find Your Home <notifications@your-domain.com>">
            <TextInput name="emailFrom" defaultValue={config.email_from ?? ""} />
          </Field>
          <Field label="Replies go to (optional)" name="emailReplyTo">
            <TextInput name="emailReplyTo" type="email" defaultValue={config.email_reply_to ?? ""} />
          </Field>
          <Field label="New Resend API key" name="resendApiKey" hint="Leave empty to keep the saved key.">
            <PasswordInput name="resendApiKey" autoComplete="off" placeholder="re_…" />
          </Field>
        </ActionForm>
        <TestButton channel="email" label="Send a test email to me" />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">WhatsApp (Meta WhatsApp Cloud API)</h2>
        <p className="text-sm text-text-muted">
          In Meta Business Manager: add a WhatsApp number, create a permanent access token for a system user, and get message
          templates approved. Use templates with two variables: {"{{1}}"} = title, {"{{2}}"} = message. Members only get WhatsApp
          messages after they switch it on and confirm their number.
        </p>
        <KeyStatus label="Access token" secret={secret("whatsapp_access_token")} name="whatsapp_access_token" fmt={fmt} />
        <ActionForm action={saveWhatsAppIntegration} submitLabel="Save WhatsApp settings">
          <Checkbox name="whatsappEnabled" label="Send WhatsApp messages" defaultChecked={config.whatsapp_enabled} />
          <Field label="Phone number ID" name="phoneNumberId" hint="From WhatsApp Manager → API setup (a long number, not the phone number).">
            <TextInput name="phoneNumberId" inputMode="numeric" defaultValue={config.whatsapp_phone_number_id ?? ""} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Updates template (utility)" name="defaultTemplate" hint="Used for listing decisions, enquiries and visits.">
              <TextInput name="defaultTemplate" defaultValue={templates.default?.name ?? ""} placeholder="account_update" />
            </Field>
            <Field label="Language" name="defaultLanguage">
              <TextInput name="defaultLanguage" defaultValue={templates.default?.language ?? "en"} />
            </Field>
            <Field label="News template (marketing)" name="broadcastTemplate" hint="Used for messages you send to many members.">
              <TextInput name="broadcastTemplate" defaultValue={templates.broadcast?.name ?? ""} placeholder="news_update" />
            </Field>
            <Field label="Language" name="broadcastLanguage">
              <TextInput name="broadcastLanguage" defaultValue={templates.broadcast?.language ?? "en"} />
            </Field>
          </div>
          <Field label="New access token" name="whatsappToken" hint="Leave empty to keep the saved token.">
            <PasswordInput name="whatsappToken" autoComplete="off" />
          </Field>
        </ActionForm>
        <TestButton channel="whatsapp" label="Send a test WhatsApp to me" hint="Turn on WhatsApp with your number in your own notification settings first." />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Phone and browser notifications</h2>
        <p className="text-sm text-text-muted">
          Phone notifications use Expo&rsquo;s push service and work in the installed app. Browser notifications need the keys
          from <code>pnpm setup:web-push</code> on the server (see the operations guide).
        </p>
        <KeyStatus label="Expo access token (optional)" secret={secret("expo_access_token")} name="expo_access_token" fmt={fmt} />
        <ActionForm action={savePushIntegration} submitLabel="Save push settings">
          <Checkbox name="pushEnabled" label="Send phone and browser notifications" defaultChecked={config.push_enabled} />
          <Field label="New Expo access token" name="expoToken" hint="Only needed if you turn on “enhanced push security” in your Expo account.">
            <PasswordInput name="expoToken" autoComplete="off" />
          </Field>
        </ActionForm>
        <TestButton channel="push" label="Send a test notification to my devices" hint="Turn on notifications on your phone or in this browser first." />
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Google Sheets (enquiries)</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Create a Google Sheet, open Extensions → Apps Script, and paste the script below.</li>
          <li>Click “Create a new secret” here and put the secret into the script.</li>
          <li>In Apps Script: Deploy → New deployment → Web app, execute as you, access “Anyone”. Copy the URL ending in /exec.</li>
          <li>Paste the URL below, tick the box and save. Every new enquiry, and later status changes, update the sheet.</li>
        </ol>
        <KeyStatus label="Shared secret" secret={secret("sheets_webhook_secret")} name="sheets_webhook_secret" fmt={fmt} />
        <ActionForm action={createSheetsSecret} submitLabel="Create a new secret" variant="secondary" confirm="Create a new secret? The sheet stops updating until you paste the new one into the script.">
          {null}
        </ActionForm>
        <ActionForm action={saveSheetsIntegration} submitLabel="Save Google Sheets settings">
          <Checkbox name="sheetsEnabled" label="Copy enquiries to my Google Sheet" defaultChecked={config.sheets_enabled} />
          <Field label="Apps Script web app URL" name="sheetsUrl">
            <TextInput name="sheetsUrl" type="url" placeholder="https://script.google.com/macros/s/…/exec" defaultValue={config.sheets_webhook_url ?? ""} />
          </Field>
        </ActionForm>
        <ActionForm action={syncAllEnquiriesToSheet} submitLabel="Send all existing enquiries to the sheet" variant="secondary">
          {null}
        </ActionForm>
        <details>
          <summary className="cursor-pointer text-sm font-medium">Show the Apps Script</summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-surface-muted p-3 text-xs"><code>{SHEETS_APPS_SCRIPT}</code></pre>
        </details>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Delivery log</h2>
        <p className="mb-3 mt-1 text-sm text-text-muted">The latest 25 messages leaving the app. Failed ones are retried automatically up to 8 times.</p>
        {log?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Channel</th>
                  <th className="py-2 pr-3 font-medium">Kind</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {log.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(row.created_at, fmt)}</td>
                    <td className="py-2 pr-3">{row.channel}</td>
                    <td className="py-2 pr-3">{row.template.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={row.status === "sent" ? "published" : row.status === "failed" ? "rejected" : undefined}>
                        {row.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="py-2 text-text-muted">{row.last_error ?? (row.attempts > 1 ? `${row.attempts} attempts` : "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Nothing sent yet.</p>
        )}
      </Card>
    </div>
  );
}

function KeyStatus({
  label,
  name,
  secret,
  fmt,
}: {
  label: string;
  name: string;
  secret: { is_set: boolean; updated_at: string | null } | undefined;
  fmt: { locale: string; timeZone: string };
}): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="font-medium">{label}:</span>
      {secret?.is_set ? (
        <>
          <Badge tone="published">saved</Badge>
          {secret.updated_at ? <span className="text-text-muted">updated {formatDateTime(secret.updated_at, fmt)}</span> : null}
          <ActionForm action={removeIntegrationKey} submitLabel="Remove" submitAriaLabel={`Remove ${label}`} variant="ghost" inline confirm={`Remove the ${label}? Sending stops until a new one is saved.`}>
            <input type="hidden" name="name" value={name} />
          </ActionForm>
        </>
      ) : (
        <Badge>not set</Badge>
      )}
    </div>
  );
}

function TestButton({ channel, label, hint }: { channel: "email" | "whatsapp" | "push"; label: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <ActionForm action={sendIntegrationTest} submitLabel={label} variant="secondary">
        <input type="hidden" name="channel" value={channel} />
      </ActionForm>
      {hint ? <p className="text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}
