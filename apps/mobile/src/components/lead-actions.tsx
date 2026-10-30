import AsyncStorage from "@react-native-async-storage/async-storage";
import { tokens, zonedLocalToUtc } from "@fyh/shared";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { env, supabase } from "@/lib/supabase";
import { Button, Field, Notice, text } from "./ui";

// Same as the website: View phone / Download brochure / Request a callback first ask for a name,
// a phone number and up to three short questions. Each becomes a lead; then the details open.

const { colors, spacing, fontSize, radius } = tokens;
const CONSENT_VERSION = "2026-10-lead-v1";
const STORAGE_KEY = "fyh_visitor_v1";

export type LeadQuestion = { id: string; label: string; options: string[] };
type Kind = "contact_reveal" | "brochure" | "callback";
type Visitor = { name: string; phone: string; email: string; answers: Record<string, string> };
type Revealed = { phone?: string | null; whatsapp?: string | null; email?: string | null };

export function leadQuestions(value: unknown): LeadQuestion[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((q): q is LeadQuestion => Boolean(q) && typeof q.id === "string" && typeof q.label === "string" && Array.isArray(q.options))
    .slice(0, 3)
    .map((q) => ({ id: q.id, label: q.label, options: q.options.filter((o) => typeof o === "string").slice(0, 6) }));
}

export function LeadActions({
  listingId,
  hasPhone,
  hasWhatsapp,
  hasEmail,
  hasBrochure,
  questions,
  brandName,
}: {
  listingId: string;
  hasPhone: boolean;
  hasWhatsapp: boolean;
  hasEmail: boolean;
  hasBrochure: boolean;
  questions: LeadQuestion[];
  brandName: string;
}) {
  const [stored, setStored] = useState<Visitor | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [asap, setAsap] = useState(true);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const hasContact = hasPhone || hasWhatsapp || hasEmail;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => (raw ? setStored(JSON.parse(raw) as Visitor) : null))
      .catch(() => null);
  }, []);

  function open(next: Kind) {
    setError(null);
    // Returning visitors skip the form, except for a callback (they pick a time).
    if (stored && next !== "callback") {
      void submit(next, stored);
      return;
    }
    setName(stored?.name ?? "");
    setPhone(stored?.phone ?? "");
    setEmail(stored?.email ?? "");
    setAnswers(stored?.answers ?? {});
    setConsent(Boolean(stored));
    setKind(next);
  }

  async function submit(which: Kind, visitor: Visitor, callbackAt?: string | null) {
    setSending(true);
    setError(null);
    try {
      const { data, error: failure } = await supabase.rpc("submit_gated_lead", {
        p_listing_id: listingId,
        p_kind: which,
        p_name: visitor.name,
        p_phone: visitor.phone,
        p_email: visitor.email || undefined,
        p_answers: visitor.answers,
        p_callback_at: callbackAt ?? undefined,
        p_consent_text_version: CONSENT_VERSION,
        p_source: "app",
      });
      if (failure) throw new Error(failure.message);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(visitor)).catch(() => null);
      setStored(visitor);
      setKind(null);
      const result = (data ?? {}) as { brochure_key?: string | null } & Revealed;
      if (which === "contact_reveal") setRevealed(result);
      if (which === "brochure" && result.brochure_key) {
        await Linking.openURL(`${env.supabaseUrl}/storage/v1/object/public/listing-brochures/${result.brochure_key}`);
        setDone("The brochure is opening. The lister may call you about it.");
      }
      if (which === "callback") setDone("Callback requested. The lister or our team will call you.");
    } catch (failure) {
      setDone(null);
      setError(failure instanceof Error ? failure.message : "Something went wrong. Try again.");
    } finally {
      setSending(false);
    }
  }

  function send() {
    if (!kind) return;
    if (!name.trim()) return setError("Please enter your name.");
    if (phone.replace(/\D/g, "").length < 7) return setError("Please enter a valid phone number.");
    if (!consent) return setError(`Please agree that ${brandName} shares your details with the lister.`);
    let callbackAt: string | null = null;
    if (kind === "callback" && !asap) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return setError("Use the format 2026-11-05 and 14:30.");
      callbackAt = zonedLocalToUtc(`${date}T${time}`, Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
      if (Date.parse(callbackAt) <= Date.now()) return setError("Choose a time in the future.");
    }
    void submit(kind, { name: name.trim(), phone: phone.trim(), email: email.trim(), answers }, callbackAt);
  }

  const title = kind === "brochure" ? "Download the brochure" : kind === "callback" ? "Request a callback" : "View contact details";

  return (
    <View style={{ gap: spacing.sm }}>
      {revealed ? (
        <View style={styles.actions}>
          {revealed.phone ? <Button label={`Call ${revealed.phone}`} onPress={() => Linking.openURL(`tel:${revealed.phone}`)} style={{ flex: 1 }} /> : null}
          {revealed.whatsapp ? (
            <Button label="WhatsApp" variant="secondary" onPress={() => Linking.openURL(`https://wa.me/${revealed.whatsapp!.replace(/\D/g, "")}`)} style={{ flex: 1 }} />
          ) : null}
          {revealed.email ? <Button label="Email" variant="secondary" onPress={() => Linking.openURL(`mailto:${revealed.email}`)} style={{ flex: 1 }} /> : null}
        </View>
      ) : hasContact ? (
        <Button label={hasPhone ? "View phone number" : "View contact details"} loading={sending && !kind} onPress={() => open("contact_reveal")} />
      ) : null}
      <View style={styles.actions}>
        {hasBrochure ? <Button label="Download brochure" variant="accent" onPress={() => open("brochure")} style={{ flex: 1 }} /> : null}
        <Button label="Request a callback" variant="secondary" onPress={() => open("callback")} style={{ flex: 1 }} />
      </View>
      {done ? <Notice tone="success">{done}</Notice> : null}
      {error && !kind ? <Notice tone="danger">{error}</Notice> : null}

      <Modal visible={kind !== null} animationType="slide" transparent onRequestClose={() => setKind(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} keyboardShouldPersistTaps="handled">
              <Text style={text.h2}>{title}</Text>
              <Text style={text.muted}>Leave your details. The lister gets them so they can help you.</Text>
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <Field label="Name" required autoComplete="name" value={name} onChangeText={setName} />
              <Field label="Phone" required autoComplete="tel" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
              <Field label="Email (optional)" autoComplete="email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
              {questions.map((question) => (
                <View key={question.id} style={{ gap: spacing.xs }} accessibilityRole="radiogroup" accessibilityLabel={question.label}>
                  <Text style={styles.label}>{question.label}</Text>
                  <View style={styles.chips}>
                    {question.options.map((option) => {
                      const selected = answers[question.id] === option;
                      return (
                        <Pressable
                          key={option}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          onPress={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                          style={[styles.chip, selected ? styles.chipOn : null]}
                        >
                          <Text style={[styles.chipText, selected ? { color: colors.surface } : null]}>{option}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
              {kind === "callback" ? (
                <View style={{ gap: spacing.sm }}>
                  <Pressable accessibilityRole="switch" accessibilityState={{ checked: asap }} onPress={() => setAsap((v) => !v)} style={styles.consent}>
                    <Switch value={asap} onValueChange={setAsap} trackColor={{ true: colors.brand }} accessibilityElementsHidden />
                    <Text style={styles.consentText}>Call me as soon as possible</Text>
                  </Pressable>
                  {!asap ? (
                    <View style={styles.actions}>
                      <View style={{ flex: 1 }}>
                        <Field label="Date" placeholder="2026-11-05" value={date} onChangeText={setDate} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Field label="Time" placeholder="14:30" value={time} onChangeText={setTime} />
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent((v) => !v)} style={styles.consent}>
                <Switch value={consent} onValueChange={setConsent} trackColor={{ true: colors.brand }} accessibilityElementsHidden />
                <Text style={styles.consentText}>I agree that {brandName} shares my name and phone number with the lister.</Text>
              </Pressable>
              <Button label={kind === "brochure" ? "Download" : kind === "callback" ? "Request callback" : "Show details"} loading={sending} onPress={send} />
              <Button label="Cancel" variant="secondary" onPress={() => setKind(null)} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "92%" },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 8, minHeight: 40, justifyContent: "center" },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: fontSize.sm, color: colors.text },
  consent: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48 },
  consentText: { flex: 1, fontSize: fontSize.sm, color: colors.text },
});
