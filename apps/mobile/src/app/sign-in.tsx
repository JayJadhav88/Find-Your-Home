import { fieldErrors, signInSchema, tokens } from "@fyh/shared";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, Field, Notice, text } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const { spacing } = tokens;

export default function SignInScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setMessage(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) {
      setMessage(
        error.code === "email_not_confirmed"
          ? "Please confirm your email address first. Check your inbox for the link."
          : error.code === "user_banned"
            ? "This account has been suspended. Contact us for help."
            : error.status === 429
              ? "Too many attempts. Please wait a few minutes."
              : "Email or password is incorrect.",
      );
      return;
    }
    await refresh();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={text.h1} accessibilityRole="header">
          Sign in
        </Text>
        <Text style={text.muted}>Save homes, send enquiries and manage your listings.</Text>
        {message ? <Notice tone="danger">{message}</Notice> : null}
        <Field label="Email" required autoComplete="email" keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" value={email} onChangeText={setEmail} error={errors.email} />
        <Field label="Password" required secureTextEntry autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} error={errors.password} onSubmitEditing={submit} />
        <Button label="Sign in" loading={busy} onPress={submit} />
        <View style={styles.links}>
          <Link href="/forgot-password" style={text.link}>
            Forgot your password?
          </Link>
          <Link href="/sign-up" style={text.link}>
            Create an account
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md },
  links: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm },
});
