import { fieldErrors, signUpSchema, tokens } from "@fyh/shared";
import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { Button, Field, Notice, text } from "@/components/ui";
import { env, supabase } from "@/lib/supabase";

const { spacing } = tokens;

export default function SignUpScreen() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = signUpSchema.safeParse({ displayName, email, password });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      // The confirmation link opens the website, which confirms the email; then sign in here.
      options: { data: { display_name: parsed.data.displayName }, emailRedirectTo: `${env.siteUrl}/auth/callback?next=/account` },
    });
    setBusy(false);
    if (error) {
      setResult({
        ok: false,
        text: error.code === "weak_password" ? error.message : error.status === 429 ? "Too many attempts. Please wait a few minutes." : "We couldn't create your account. Please try again.",
      });
      return;
    }
    setResult({ ok: true, text: `Check ${parsed.data.email} for a confirmation link, then come back and sign in.` });
  }

  if (result?.ok) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Notice tone="success" title="Almost there">
          {result.text}
        </Notice>
        <Link href="/sign-in" style={text.link}>
          Go to sign in
        </Link>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={text.h1} accessibilityRole="header">
          Create an account
        </Text>
        {result && !result.ok ? <Notice tone="danger">{result.text}</Notice> : null}
        <Field label="Your name" required autoComplete="name" value={displayName} onChangeText={setDisplayName} error={errors.displayName} />
        <Field label="Email" required autoComplete="email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} error={errors.email} />
        <Field
          label="Password"
          required
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          hint="At least 10 characters, including a letter and a number."
        />
        <Button label="Create account" loading={busy} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ container: { padding: spacing.lg, gap: spacing.md } });
