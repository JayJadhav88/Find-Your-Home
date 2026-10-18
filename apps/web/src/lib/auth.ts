import "server-only";
import type { AppRole } from "@fyh/shared";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createUserClient } from "./supabase";

export interface Viewer {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  status: "active" | "suspended" | "deletion_requested";
  roles: AppRole[];
}

/**
 * The signed-in user, verified with Supabase Auth, plus profile and roles from the
 * database. Deduplicated per request. Reads cookies: call inside <Suspense> or an action.
 * UI checks are convenience only — RLS and workflow functions enforce the real rules.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createUserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("display_name, status").eq("id", data.user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", data.user.id),
  ]);
  if (!profile) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    emailVerified: Boolean(data.user.email_confirmed_at),
    displayName: profile.display_name,
    status: profile.status,
    roles: (roles ?? []).map((row) => row.role),
  };
});

export function hasRole(viewer: Viewer | null, ...roles: AppRole[]): boolean {
  return Boolean(viewer && viewer.status === "active" && roles.some((role) => viewer.roles.includes(role)));
}

export const isStaff = (viewer: Viewer | null) => hasRole(viewer, "moderator", "administrator");
export const isAdmin = (viewer: Viewer | null) => hasRole(viewer, "administrator");
export const canList = (viewer: Viewer | null) => hasRole(viewer, "owner", "agent", "administrator");

export async function requireViewer(next: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return viewer;
}

export async function requireStaff(next: string): Promise<Viewer> {
  const viewer = await requireViewer(next);
  if (!isStaff(viewer)) redirect("/account?denied=admin");
  return viewer;
}

export async function requireAdmin(next: string): Promise<Viewer> {
  const viewer = await requireViewer(next);
  if (!isAdmin(viewer)) redirect("/admin?denied=admin-only");
  return viewer;
}

/** Only allow same-site relative redirects after sign-in. */
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = "/account"): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
