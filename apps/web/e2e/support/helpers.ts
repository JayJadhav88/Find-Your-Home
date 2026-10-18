import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import jpeg from "jpeg-js";
import { stack } from "./stack";

/** Local demo accounts from supabase/seed.sql (local test data only). */
export const DEMO = {
  password: "DemoPassword123",
  admin: "demo.admin@example.test",
  moderator: "demo.moderator@example.test",
  owner: "demo.owner@example.test",
  buyer: "demo.buyer@example.test",
} as const;

export const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${randomBytes(3).toString("hex")}@example.test`;
export const strongPassword = () => `E2e${randomBytes(8).toString("hex")}9`;

export async function signIn(page: Page, email: string, password: string, next = "/account") {
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === next.split("?")[0], { timeout: 30_000 });
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

/** Waits for the newest Mailpit message to `to` whose subject contains `subject`; returns its first link. */
export async function emailLink(to: string, subject: string): Promise<string> {
  const { mailpitUrl } = stack();
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`).then((r) => r.json());
    const message = (search.messages ?? []).find((m: { Subject: string }) => m.Subject.includes(subject));
    if (message) {
      const full = await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`).then((r) => r.json());
      const href = /href="([^"]+)"/.exec(full.HTML ?? "")?.[1];
      if (href) return href.replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No "${subject}" email for ${to} arrived in Mailpit`);
}

/** Runs the photo-publishing and email workers once (they normally run on a schedule). */
export async function runWorkers() {
  const { apiUrl, workerSecret } = stack();
  if (!workerSecret) throw new Error("WORKER_SECRET missing: create supabase/functions/.env (see .env.example)");
  for (const name of ["process-jobs", "send-emails"]) {
    const response = await fetch(`${apiUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: { "x-worker-secret": workerSecret, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.ok, `${name} worker responded ${response.status}`).toBe(true);
  }
}

/** A small, valid JPEG for upload tests. */
export function testJpeg(): Buffer {
  const width = 320;
  const height = 240;
  const data = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    data.set([31, 95 + (index % 60), 87, 255], index * 4);
  }
  return Buffer.from(jpeg.encode({ data, width, height }, 80).data);
}

/** Uses the service key (local only) for assertions the UI cannot make directly. */
export async function adminRest<T = unknown>(pathAndQuery: string): Promise<T> {
  const { apiUrl, secretKey } = stack();
  const response = await fetch(`${apiUrl}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok) throw new Error(`REST ${pathAndQuery} failed: ${response.status}`);
  return response.json() as Promise<T>;
}
