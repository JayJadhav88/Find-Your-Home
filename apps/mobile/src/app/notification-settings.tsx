import {
  fieldErrors,
  getNotificationPreferences,
  getSettings,
  notificationPreferencesSchema,
  tokens,
  updateNotificationPreferences,
  WHATSAPP_CONSENT_TEXT,
} from "@fyh/shared";
import { useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Button, Card, ErrorState, Field, Loading, Notice, text } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";

const { colors, spacing } = tokens;

interface Form {
  emailEnabled: boolean;
  pushEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappNumber: string;
  alertsEnabled: boolean;
  quietHoursEnabled: boolean;
  timezone: string;
}

const phoneTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function NotificationSettingsScreen() {
  const { viewer, loading: sessionLoading } = useSession();
  const data = useResource(async () => {
    if (!viewer) return null;
    const [prefs, settings] = await Promise.all([getNotificationPreferences(supabase, viewer.id), getSettings(supabase)]);
    return { prefs, settings };
  }, [viewer?.id]);

  const [form, setForm] = useState<Form | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  // Fill the form once per loaded record (adjusting state during render, not in an effect).
  const prefs = data.data?.prefs;
  const sourceKey = prefs ? `${prefs.user_id}:${prefs.updated_at}` : null;
  if (prefs && sourceKey !== loadedFor) {
    setLoadedFor(sourceKey);
    setForm({
      emailEnabled: prefs.email_enabled,
      pushEnabled: prefs.push_enabled,
      whatsappEnabled: prefs.whatsapp_enabled,
      whatsappNumber: prefs.whatsapp_number ?? "",
      alertsEnabled: prefs.alerts_enabled,
      quietHoursEnabled: prefs.quiet_hours_enabled,
      timezone: prefs.timezone ?? phoneTimeZone,
    });
  }

  if (sessionLoading) return <Loading />;
  if (!viewer) return <SignInPrompt title="Notification settings" message="Sign in to choose how we contact you." />;
  if (data.error) return <ErrorState message={data.error} onRetry={data.reload} />;
  if (!form || !data.data) return <Loading />;
  const settings = data.data.settings;

  const set = <K extends keyof Form>(key: K) => (value: Form[K]) => setForm((current) => (current ? { ...current, [key]: value } : current));

  async function save() {
    if (!form || !viewer) return;
    setNotice(null);
    const parsed = notificationPreferencesSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await updateNotificationPreferences(supabase, viewer.id, form);
      setNotice({ tone: "success", text: "Notification settings saved." });
      data.reload();
    } catch (error) {
      setNotice({ tone: "danger", text: error instanceof Error ? error.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
      <Text style={text.muted}>Notifications always appear in the app. Choose where else you want them.</Text>
      <Card style={{ gap: spacing.sm }}>
        <Toggle label={`Email (${viewer.email})`} value={form.emailEnabled} onChange={set("emailEnabled")} />
        <Toggle label="Phone notifications" hint="Shown on this phone even when the app is closed." value={form.pushEnabled} onChange={set("pushEnabled")} />
        <Toggle label="WhatsApp" hint={WHATSAPP_CONSENT_TEXT} value={form.whatsappEnabled} onChange={set("whatsappEnabled")} />
        {form.whatsappEnabled ? (
          <Field
            label="WhatsApp number"
            value={form.whatsappNumber}
            onChangeText={set("whatsappNumber")}
            keyboardType="phone-pad"
            autoComplete="tel"
            hint="With country code, e.g. +91 98765 43210."
            error={errors.whatsappNumber}
          />
        ) : null}
        <Toggle label="Saved-search alerts" value={form.alertsEnabled} onChange={set("alertsEnabled")} />
        <Toggle
          label="Quiet hours"
          hint={`Hold news and alerts from ${settings.quiet_start_hour}:00 to ${settings.quiet_end_hour}:00.`}
          value={form.quietHoursEnabled}
          onChange={set("quietHoursEnabled")}
        />
        <Field label="Time zone" value={form.timezone} onChangeText={set("timezone")} autoCapitalize="none" error={errors.timezone} hint={`This phone: ${phoneTimeZone}`} />
      </Card>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <Button label="Save" loading={saving} onPress={save} />
    </ScrollView>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={text.body}>{label}</Text>
        {hint ? <Text style={text.muted}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.brand, false: colors.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48 },
});
