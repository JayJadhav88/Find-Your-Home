import { REPORT_REASON_LABEL, REPORT_REASONS, reportListing, tokens, type ReportReason } from "@fyh/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { Button, Card, Field, Notice, text } from "./ui";

const { colors, spacing } = tokens;

/** "Report this listing": goes to the moderators with automatic warning signs. */
export function ReportListing({ listingId }: { listingId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("fraud");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (!open) {
    return <Button label="Report this listing" variant="ghost" onPress={() => setOpen(true)} />;
  }
  if (result?.ok) return <Notice tone="success">{result.text}</Notice>;

  async function send() {
    setBusy(true);
    try {
      await reportListing(supabase, listingId, reason, details);
      setResult({ ok: true, text: "Thank you. Our moderators will take a look." });
    } catch (failure) {
      setResult({ ok: false, text: failure instanceof Error ? failure.message : "Could not send the report." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ gap: spacing.sm }}>
      <Text style={text.h2}>{"What's wrong?"}</Text>
      <View accessibilityRole="radiogroup" style={{ gap: spacing.xs }}>
        {REPORT_REASONS.map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: reason === value }}
            onPress={() => setReason(value)}
            style={[styles.option, reason === value && styles.selected]}
          >
            <Text style={text.body}>{REPORT_REASON_LABEL[value]}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="Details (optional)" multiline value={details} onChangeText={setDetails} maxLength={1000} />
      {result && !result.ok ? <Notice tone="danger">{result.text}</Notice> : null}
      <Button label="Send report" loading={busy} onPress={send} />
      <Button label="Cancel" variant="ghost" onPress={() => setOpen(false)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  option: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  selected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
});
