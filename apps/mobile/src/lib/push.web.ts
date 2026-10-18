// The web build uses the website's browser notifications instead.
export type PushSetup =
  | { ok: true }
  | { ok: false; reason: "not_device" | "denied" | "no_project" | "expo_go" | "failed"; message: string };

export async function setUpPush(_options: { ask: boolean }): Promise<PushSetup> {
  return { ok: false, reason: "not_device", message: "Use the website's browser notifications instead." };
}

export async function forgetThisPhone(): Promise<void> {}

export const pushSupported = false;
