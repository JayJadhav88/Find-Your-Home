import { profileSchema, fieldErrors, TEAM_ROLES, tokens, updateProfile } from "@fyh/shared";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { Badge, Button, Card, Field, Loading, Notice, text } from "@/components/ui";
import { useInbox } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { env, supabase } from "@/lib/supabase";

const { spacing } = tokens;

export default function AccountScreen() {
  const router = useRouter();
  const { viewer, loading, refresh, signOut } = useSession();
  const { unread } = useInbox();
  const isTeam = Boolean(viewer?.roles.some((role) => (TEAM_ROLES as readonly string[]).includes(role)));
  const [displayName, setDisplayName] = useState(viewer?.displayName ?? "");
  const [phone, setPhone] = useState(viewer?.phone ?? "");
  // Refill the form when the signed-in profile changes (React's "adjust state on prop change").
  const profileKey = viewer ? `${viewer.id}:${viewer.displayName}:${viewer.phone ?? ""}` : "";
  const [loadedKey, setLoadedKey] = useState(profileKey);
  if (profileKey !== loadedKey) {
    setLoadedKey(profileKey);
    setDisplayName(viewer?.displayName ?? "");
    setPhone(viewer?.phone ?? "");
  }
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) return <Loading />;
  if (!viewer) return <SignInPrompt title="Your account" message="Sign in to manage your profile, enquiries and listings." />;

  async function save() {
    const parsed = profileSchema.safeParse({ displayName, phone, marketingOptIn: false });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await updateProfile(supabase, viewer!.id, { displayName: parsed.data.displayName, phone: parsed.data.phone });
      await refresh();
      setNotice({ tone: "success", text: "Profile saved." });
    } catch (failure) {
      setNotice({ tone: "danger", text: failure instanceof Error ? failure.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  async function requestExport() {
    const { error } = await supabase.rpc("request_data_export");
    setNotice(error ? { tone: "danger", text: error.message } : { tone: "success", text: "Request received. We'll email you a copy of your data." });
  }

  const roles = viewer.roles.filter((role) => role !== "buyer");

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
      <Card style={{ gap: spacing.xs }}>
        <Text style={text.h2}>{viewer.displayName}</Text>
        <Text style={text.muted}>{viewer.email}</Text>
        {roles.length ? (
          <View style={{ flexDirection: "row", gap: spacing.xs, flexWrap: "wrap" }}>
            {roles.map((role) => (
              <Badge key={role} label={role === "builder" ? "Verified builder" : role} />
            ))}
          </View>
        ) : null}
      </Card>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <Card style={{ gap: spacing.md }}>
        <Text style={text.h2}>Profile</Text>
        <Field label="Name" required value={displayName} onChangeText={setDisplayName} error={errors.displayName} autoComplete="name" />
        <Field label="Phone" value={phone} onChangeText={setPhone} error={errors.phone} keyboardType="phone-pad" hint="Only shown on listings where you choose to show it." />
        <Button label="Save profile" loading={saving} onPress={save} />
      </Card>
      <Button
        label={unread ? `Notifications (${unread} unread)` : "Notifications"}
        variant={unread ? "primary" : "secondary"}
        onPress={() => router.push("/notifications")}
      />
      <Button label="Enquiries" variant="secondary" onPress={() => router.push("/enquiries")} />
      <Button label="Saved searches" variant="secondary" onPress={() => router.push("/saved-searches")} />
      {isTeam ? (
        <Button
          label="Admin panel"
          variant="secondary"
          onPress={() => WebBrowser.openBrowserAsync(`${env.siteUrl}/admin`)}
          accessibilityHint="Opens the admin pages in a browser window"
        />
      ) : null}
      <Card style={{ gap: spacing.sm }}>
        <Text style={text.h2}>Privacy</Text>
        <Button label="Request a copy of my data" variant="secondary" onPress={requestExport} />
        <Button label="Privacy policy" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(`${env.siteUrl}/privacy`)} />
        <Button label="Terms of use" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(`${env.siteUrl}/terms`)} />
        <Button
          label="Delete my account"
          variant="ghost"
          onPress={() =>
            Alert.alert("Delete account?", "Your listings go offline and your personal data is removed, except records we must keep by law.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Request deletion",
                style: "destructive",
                onPress: async () => {
                  const { error } = await supabase.rpc("request_account_deletion");
                  setNotice(error ? { tone: "danger", text: error.message } : { tone: "success", text: "Deletion requested. We'll confirm by email." });
                },
              },
            ])
          }
        />
      </Card>
      <Button label="Sign out" variant="danger" onPress={signOut} />
    </ScrollView>
  );
}
