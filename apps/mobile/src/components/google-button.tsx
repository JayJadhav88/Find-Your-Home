import { tokens } from "@fyh/shared";
import { useState } from "react";
import { Text, View } from "react-native";
import { googleSignInEnabled, signInWithGoogle } from "@/lib/google";
import { Button, Notice, text } from "./ui";

/** "Continue with Google", shown when Google sign-in is configured. */
export function GoogleButton({ onSignedIn }: { onSignedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!googleSignInEnabled) return null;

  async function press() {
    setBusy(true);
    setMessage(null);
    const result = await signInWithGoogle();
    setBusy(false);
    if (result.ok) onSignedIn();
    else if (!result.cancelled) setMessage(result.message);
  }

  return (
    <View style={{ gap: tokens.spacing.sm }}>
      <Button label="Continue with Google" variant="secondary" loading={busy} onPress={press} />
      {message ? <Notice tone="danger">{message}</Notice> : null}
      <Text style={[text.muted, { textAlign: "center" }]}>or use your email</Text>
    </View>
  );
}
