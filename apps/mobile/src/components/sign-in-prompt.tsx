import { tokens } from "@fyh/shared";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Button, EmptyState } from "./ui";

export function SignInPrompt({ title, message }: { title: string; message: string }) {
  const router = useRouter();
  return (
    <View style={{ padding: tokens.spacing.md }}>
      <EmptyState
        title={title}
        message={message}
        action={
          <View style={{ gap: tokens.spacing.sm, alignSelf: "stretch" }}>
            <Button label="Sign in" onPress={() => router.push("/sign-in")} />
            <Button label="Create an account" variant="secondary" onPress={() => router.push("/sign-up")} />
          </View>
        }
      />
    </View>
  );
}
