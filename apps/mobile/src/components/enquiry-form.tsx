import { enquirySchema, fieldErrors, submitEnquiry, tokens, zonedLocalToUtc } from "@fyh/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { Button, Field, Notice, Segmented } from "./ui";

const { colors, spacing, fontSize } = tokens;
const CONSENT_VERSION = "2026-10-v1";

/** Same rules as the website: validated here, then by the submit_enquiry database function. */
export function EnquiryForm({
  listingId,
  brandName,
  defaultName,
  defaultEmail,
}: {
  listingId: string;
  brandName: string;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [kind, setKind] = useState<"enquiry" | "visit_request">("enquiry");
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("Is this property still available?");
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    const visitAt = visitDate && visitTime ? `${visitDate}T${visitTime}` : undefined;
    const parsed = enquirySchema.safeParse({ listingId, name, email, phone, message, kind, visitAt, timeZone, consent });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    let visitAtUtc: string | undefined;
    if (kind === "visit_request") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate) || !/^\d{2}:\d{2}$/.test(visitTime)) {
        setErrors({ visitAt: "Use the format 2026-11-05 and 14:30" });
        return;
      }
      visitAtUtc = zonedLocalToUtc(`${visitDate}T${visitTime}`, timeZone);
      if (Date.parse(visitAtUtc) <= Date.now()) {
        setErrors({ visitAt: "Choose a time in the future" });
        return;
      }
    }
    setErrors({});
    setSending(true);
    try {
      await submitEnquiry(supabase, {
        listingId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        message: parsed.data.message,
        kind,
        visitAtUtc,
        timeZone,
        consentVersion: CONSENT_VERSION,
      });
      setStatus({
        ok: true,
        text:
          kind === "visit_request"
            ? "Visit requested. It isn't confirmed yet — the lister will reply by email."
            : "Message sent. The lister will reply by email.",
      });
    } catch (failure) {
      setStatus({ ok: false, text: failure instanceof Error ? failure.message : "We couldn't send your message." });
    } finally {
      setSending(false);
    }
  }

  if (status?.ok) return <Notice tone="success">{status.text}</Notice>;

  return (
    <View style={{ gap: spacing.md }}>
      <Segmented
        label="What would you like to do?"
        value={kind}
        options={[
          { value: "enquiry", label: "Ask a question" },
          { value: "visit_request", label: "Request a visit" },
        ]}
        onChange={(value) => {
          const next = (value || "enquiry") as typeof kind;
          setKind(next);
          setMessage(next === "visit_request" ? "I'd like to visit this property." : "Is this property still available?");
        }}
      />
      {status && !status.ok ? <Notice tone="danger">{status.text}</Notice> : null}
      <Field label="Name" required autoComplete="name" value={name} onChangeText={setName} error={errors.name} />
      <Field
        label="Email"
        required
        autoComplete="email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
      />
      <Field label="Phone (optional)" autoComplete="tel" keyboardType="phone-pad" value={phone} onChangeText={setPhone} error={errors.phone} />
      {kind === "visit_request" ? (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Date" required placeholder="2026-11-05" value={visitDate} onChangeText={setVisitDate} error={errors.visitAt} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Time" required placeholder="14:30" value={visitTime} onChangeText={setVisitTime} hint={timeZone} />
          </View>
        </View>
      ) : null}
      <Field label="Message" required multiline value={message} onChangeText={setMessage} error={errors.message} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        onPress={() => setConsent((value) => !value)}
        style={styles.consent}
      >
        <Switch value={consent} onValueChange={setConsent} trackColor={{ true: colors.brand }} accessibilityElementsHidden />
        <Text style={styles.consentText}>I agree that {brandName} passes my name, contact details and message to the lister.</Text>
      </Pressable>
      {errors.consent ? <Text style={styles.error}>{errors.consent}</Text> : null}
      <Button label={kind === "visit_request" ? "Request a visit" : "Send message"} loading={sending} onPress={send} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  consent: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48 },
  consentText: { flex: 1, fontSize: fontSize.sm, color: colors.text },
  error: { color: colors.danger, fontSize: fontSize.sm },
});
