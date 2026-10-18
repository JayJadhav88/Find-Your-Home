import { enquiryAction, formatDateTime, getEnquiry, getSettings, tokens } from "@fyh/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { Button, Card, ErrorState, Loading, Notice, text } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { useResource } from "@/lib/use-resource";

const { spacing } = tokens;

export default function EnquiryScreen() {
  const params = useLocalSearchParams<"/enquiries/[id]">();
  const id = Array.isArray(params.id) ? (params.id[0] ?? "") : (params.id ?? "");
  const { viewer } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const { data, error, loading, reload } = useResource(async () => {
    const [enquiry, settings] = await Promise.all([getEnquiry(supabase, id), getSettings(supabase)]);
    return { enquiry, settings };
  }, [id]);

  if (loading && !data) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const enquiry = data?.enquiry;
  if (!enquiry || !data) return <ErrorState message="This enquiry is not available." />;

  const fmt = { locale: data.settings.default_locale, timeZone: data.settings.default_timezone };
  const isSender = enquiry.sender_user_id === viewer?.id;
  const isRecipient = !isSender || enquiry.assigned_to === viewer?.id;

  async function act(action: Parameters<typeof enquiryAction>[2], success: string) {
    setBusy(action);
    try {
      await enquiryAction(supabase, id, action);
      setNotice({ tone: "success", text: success });
      await reload();
    } catch (failure) {
      setNotice({ tone: "danger", text: failure instanceof Error ? failure.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
      <Text style={text.h1}>{enquiry.kind === "visit_request" ? "Visit request" : "Enquiry"}</Text>
      <Text style={text.muted}>Received {formatDateTime(enquiry.created_at, fmt)}</Text>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <Card style={{ gap: spacing.sm }}>
        {enquiry.listing ? (
          <Text style={text.body}>
            About {enquiry.listing.title} ({enquiry.listing.reference_code})
          </Text>
        ) : null}
        {isRecipient ? (
          <View style={{ gap: spacing.xs }}>
            <Text style={text.body}>From {enquiry.name}</Text>
            <Text style={text.link} onPress={() => Linking.openURL(`mailto:${enquiry.email}`)} accessibilityRole="link">
              {enquiry.email}
            </Text>
            {enquiry.phone ? (
              <Text style={text.link} onPress={() => Linking.openURL(`tel:${enquiry.phone}`)} accessibilityRole="link">
                {enquiry.phone}
              </Text>
            ) : null}
          </View>
        ) : null}
        {enquiry.kind === "visit_request" && enquiry.requested_visit_at ? (
          <Notice title={`Visit ${enquiry.visit_status}`}>
            {`${formatDateTime(enquiry.requested_visit_at, { locale: fmt.locale, timeZone: enquiry.requested_timezone ?? "UTC" })} (${enquiry.requested_timezone})`}
          </Notice>
        ) : null}
        <Text style={text.muted}>Message</Text>
        <Text style={text.body}>{enquiry.message}</Text>
      </Card>
      {isRecipient && enquiry.kind === "visit_request" && enquiry.visit_status === "requested" ? (
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button label="Confirm visit" loading={busy === "confirm_visit"} onPress={() => act("confirm_visit", "Visit confirmed. The visitor gets an email.")} style={{ flex: 1 }} />
          <Button label="Decline" variant="secondary" loading={busy === "decline_visit"} onPress={() => act("decline_visit", "Visit declined.")} style={{ flex: 1 }} />
        </View>
      ) : null}
      {isRecipient && enquiry.status !== "responded" ? (
        <Button label="Mark as replied" variant="secondary" loading={busy === "responded"} onPress={() => act("responded", "Marked as replied.")} />
      ) : null}
      {isRecipient && enquiry.status !== "closed" ? (
        <Button label="Close" variant="secondary" loading={busy === "closed"} onPress={() => act("closed", "Closed.")} />
      ) : null}
      {isSender && enquiry.kind === "visit_request" && ["requested", "confirmed"].includes(enquiry.visit_status ?? "") ? (
        <Button label="Cancel my visit request" variant="danger" loading={busy === "cancel_visit"} onPress={() => act("cancel_visit", "Visit request cancelled.")} />
      ) : null}
    </ScrollView>
  );
}
