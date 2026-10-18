"use client";

import { useEffect, useState } from "react";
import { removeWebPushSubscription, saveWebPushSubscription } from "@/app/actions/notifications";
import { Alert, Button } from "./ui";

type Status = "checking" | "unsupported" | "blocked" | "off" | "on";

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((base64Url.length + 3) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  return registration ? registration.pushManager.getSubscription() : null;
}

/** Lets this browser show notifications even when the site is closed. */
export function WebPushToggle({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const check = supported
      ? Notification.permission === "denied"
        ? Promise.resolve<Status>("blocked")
        : currentSubscription().then((subscription) => (subscription ? "on" : "off") as Status)
      : Promise.resolve<Status>("unsupported");
    check.then((next) => active && setStatus(next)).catch(() => active && setStatus("off"));
    return () => {
      active = false;
    };
  }, []);

  async function turnOn() {
    setWorking(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      const json = subscription.toJSON();
      const result = await saveWebPushSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      if (result.error) {
        await subscription.unsubscribe();
        setError(result.error);
        return;
      }
      setStatus("on");
    } catch {
      setError("This browser could not turn on notifications. Try again, or use another browser.");
    } finally {
      setWorking(false);
    }
  }

  async function turnOff() {
    setWorking(true);
    setError(null);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await removeWebPushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Browser notifications</p>
      {status === "checking" ? <p className="text-sm text-text-muted">Checking this browser…</p> : null}
      {status === "unsupported" ? (
        <p className="text-sm text-text-muted">
          This browser can&rsquo;t show notifications. On iPhone, add this site to your Home Screen first (Share → Add to Home Screen),
          then open it from there.
        </p>
      ) : null}
      {status === "blocked" ? (
        <p className="text-sm text-text-muted">
          Notifications are blocked for this site. Allow them in your browser&rsquo;s site settings, then reload this page.
        </p>
      ) : null}
      {status === "off" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={turnOn} disabled={working}>
            {working ? "Working…" : "Turn on browser notifications"}
          </Button>
          <span className="text-sm text-text-muted">Get alerts on this computer or phone even when the site is closed.</span>
        </div>
      ) : null}
      {status === "on" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">On for this browser.</span>
          <Button type="button" variant="ghost" onClick={turnOff} disabled={working}>
            Turn off
          </Button>
        </div>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
