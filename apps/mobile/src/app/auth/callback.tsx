import { Redirect } from "expo-router";

// The Google sign-in sheet normally handles this link itself; if the system opens the app
// with it instead, continue to the account screen.
export default function AuthCallback() {
  return <Redirect href="/account" />;
}
