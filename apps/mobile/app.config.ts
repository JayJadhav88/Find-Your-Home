import type { ConfigContext, ExpoConfig } from "expo/config";

// Store identifiers are permanent once an app is published, so they come from the build
// environment (eas.json profiles or the shell), not from source. The placeholders below are
// intentionally obvious and must be replaced before the first store build.
const IOS_BUNDLE_ID = process.env.APP_IOS_BUNDLE_ID ?? "com.example.findyourhome";
const ANDROID_PACKAGE = process.env.APP_ANDROID_PACKAGE ?? "com.example.findyourhome";

// Firebase file for Android push (FCM), named by the build profile in eas.json. Public
// identifiers only; see docs/15-phone-push.md. Not used by Expo Go.
const GOOGLE_SERVICES_FILE = process.env.APP_GOOGLE_SERVICES_FILE;

// Test builds that talk to a database on this computer (http://192.168.x.x) must allow plain
// http. Never set for store builds.
const ALLOW_HTTP = process.env.APP_ALLOW_HTTP === "1";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  name: process.env.APP_NAME ?? config.name ?? "Find Your Home",
  ios: { ...config.ios, bundleIdentifier: IOS_BUNDLE_ID },
  android: {
    ...config.android,
    package: ANDROID_PACKAGE,
    ...(GOOGLE_SERVICES_FILE ? { googleServicesFile: GOOGLE_SERVICES_FILE } : {}),
  },
  plugins: [...(config.plugins ?? []), ["expo-build-properties", { android: { usesCleartextTraffic: ALLOW_HTTP } }]],
  extra: {
    ...config.extra,
    // `eas init` writes the project ID into app.json; EAS_PROJECT_ID overrides it.
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : config.extra?.eas,
  },
});
