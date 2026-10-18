import type { ConfigContext, ExpoConfig } from "expo/config";

// Store identifiers are permanent once an app is published, so they come from the build
// environment (eas.json profiles or the shell), not from source. The placeholders below are
// intentionally obvious and must be replaced before the first store build.
const IOS_BUNDLE_ID = process.env.APP_IOS_BUNDLE_ID ?? "com.example.findyourhome";
const ANDROID_PACKAGE = process.env.APP_ANDROID_PACKAGE ?? "com.example.findyourhome";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  name: process.env.APP_NAME ?? config.name ?? "Find Your Home",
  ios: { ...config.ios, bundleIdentifier: IOS_BUNDLE_ID },
  android: { ...config.android, package: ANDROID_PACKAGE },
  extra: {
    ...config.extra,
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
});
