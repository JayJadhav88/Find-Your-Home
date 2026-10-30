import { tokens } from "@fyh/shared";
import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { EnquiryForm } from "./enquiry-form";
import { Button, text } from "./ui";

// "Enquire now" and "Schedule a site visit" open the enquiry form in a pop-up sheet.

const { colors, spacing, radius } = tokens;

export function EnquiryPopup({
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
  const [kind, setKind] = useState<"enquiry" | "visit_request" | null>(null);
  const [round, setRound] = useState(0);

  function open(next: "enquiry" | "visit_request") {
    setKind(next);
    setRound((value) => value + 1);
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Button label="Enquire now" variant="accent" onPress={() => open("enquiry")} />
      <Button label="Schedule a site visit" variant="secondary" onPress={() => open("visit_request")} />
      <Modal visible={kind !== null} animationType="slide" transparent onRequestClose={() => setKind(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }} keyboardShouldPersistTaps="handled">
              <Text style={text.h2}>{kind === "visit_request" ? "Schedule a site visit" : "Enquire about this property"}</Text>
              {kind ? (
                <EnquiryForm key={round} listingId={listingId} brandName={brandName} defaultName={defaultName} defaultEmail={defaultEmail} initialKind={kind} />
              ) : null}
              <Button label="Close" variant="secondary" onPress={() => setKind(null)} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "92%" },
});
