import { emailSchema, tokens } from "@fyh/shared";
import { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { Button, Field, Notice, text } from "@/components/ui";
import { env, supabase } from "@/lib/supabase";

const { spacing } = tokens;

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError("Enter a valid email address");
      return;
    }
    setBusy(true);
    // The reset link opens the website's "choose a new password" page.
    await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${env.siteUrl}/auth/callback?next=/reset-password` });
    setBusy(false);
    setSent(true);
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={text.h1} accessibilityRole="header">
        Reset your password
      </Text>
      {sent ? (
        <Notice tone="success">If an account exists for that address, we&apos;ve sent a link to reset the password.</Notice>
      ) : (
        <>
          <Text style={text.muted}>We&apos;ll email you a link to choose a new password.</Text>
          <Field label="Email" required autoComplete="email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} error={error} />
          <Button label="Send reset link" loading={busy} onPress={submit} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ container: { padding: spacing.lg, gap: spacing.md } });
