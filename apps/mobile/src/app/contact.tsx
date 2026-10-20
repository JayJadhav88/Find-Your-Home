import { getSettings, LEAD_INTEREST_LABEL, LEAD_INTERESTS, submitContactLead, tokens, type LeadInterest } from "@fyh/shared";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text } from "react-native";
import { Button, Card, Field, Notice, Segmented, text } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";

const { spacing, colors } = tokens;

// Same consent wording and version as the website's contact form.
const CONSENT_VERSION = "2026-10-contact-v1";
const INTERESTS = LEAD_INTERESTS.filter((value) => value !== "rent_out");

/** Contact us: creates one lead in Admin → Leads & enquiries (source "app"). Works signed in or out. */
export default function ContactScreen() {
  const { viewer } = useSession();
  const { data: settings } = useResource(() => getSettings(supabase), []);
  const team = settings?.brand_name ? `the ${settings.brand_name} team` : "our team";
  const [values, setValues] = useState({
    name: viewer?.displayName ?? "",
    phone: viewer?.phone ?? "",
    email: viewer?.email ?? "",
    city: "",
    reference: "",
    message: "",
    interest: "buy" as LeadInterest,
    preferredContact: "",
  });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const set = (key: keyof typeof values) => (value: string) => setValues((current) => ({ ...current, [key]: value }));

  async function send() {
    const v = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()])) as typeof values;
    const next: Record<string, string> = {};
    if (!v.name) next.name = "Please enter your name.";
    if (!v.phone && !v.email) next.phone = "Please give a phone number or an email address.";
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) next.email = "Enter a valid email address.";
    if (!v.message) next.message = "Please write a short message.";
    if (!consent) next.consent = "Please agree so we can contact you about this enquiry.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSending(true);
    try {
      await submitContactLead(supabase, {
        name: v.name,
        email: v.email,
        phone: v.phone,
        interest: v.interest,
        message: v.message,
        city: v.city,
        preferredContact: v.preferredContact,
        propertyReference: v.reference,
        consentVersion: CONSENT_VERSION,
        source: "app",
      });
      setResult({ ok: true, message: `Thank you. ${team[0]!.toUpperCase()}${team.slice(1)} will get back to you soon.` });
    } catch (failure) {
      setResult({ ok: false, message: failure instanceof Error ? failure.message : "We couldn't send your message. Please try again." });
    } finally {
      setSending(false);
    }
  }

  if (result?.ok) {
    return (
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <Notice tone="success" title="Message sent">{result.message}</Notice>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <Text style={text.body}>
          Have a question about renting, buying, selling, a new-launch project or listing your property? Send this form and our team will review
          your request. Please don&apos;t include sensitive financial or identity information.
        </Text>
        <Card style={{ gap: spacing.md }}>
          <Field label="Full name" required value={values.name} onChangeText={set("name")} error={errors.name} autoComplete="name" maxLength={100} />
          <Segmented label="What is it about?" value={values.interest} options={INTERESTS.map((value) => ({ value, label: LEAD_INTEREST_LABEL[value] }))} onChange={(value) => set("interest")(value)} />
          <Field label="Phone" value={values.phone} onChangeText={set("phone")} error={errors.phone} hint="Phone or email: at least one." keyboardType="phone-pad" autoComplete="tel" maxLength={32} />
          <Field label="Email" value={values.email} onChangeText={set("email")} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} />
          <Field label="City or locality" value={values.city} onChangeText={set("city")} maxLength={100} />
          <Segmented
            label="Preferred way to reach you"
            value={values.preferredContact}
            options={[
              { value: "", label: "Any" },
              { value: "phone", label: "Call" },
              { value: "whatsapp", label: "WhatsApp" },
              { value: "email", label: "Email" },
            ]}
            onChange={set("preferredContact")}
          />
          <Field label="Property or project reference" value={values.reference} onChangeText={set("reference")} hint="Optional, e.g. FYH-001234" autoCapitalize="characters" maxLength={60} />
          <Field label="Message" required multiline value={values.message} onChangeText={set("message")} error={errors.message} maxLength={5000} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(!consent)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48 }}>
            <Text style={[text.body, { flex: 1 }]}>I agree that {team} may contact me about this enquiry.</Text>
            <Switch value={consent} onValueChange={setConsent} trackColor={{ true: colors.brand }} accessibilityElementsHidden />
          </Pressable>
          {errors.consent ? <Text style={{ color: colors.danger }}>{errors.consent}</Text> : null}
          {result && !result.ok ? <Notice tone="danger">{result.message}</Notice> : null}
          <Button label="Send message" loading={sending} onPress={send} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
