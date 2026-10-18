"use server";

import { emailSchema, fieldErrors, passwordSchema, signInSchema, signUpSchema } from "@fyh/shared";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { absoluteUrl } from "@/lib/env";
import { createUserClient } from "@/lib/supabase";
import { formValues, type FormState } from "./types";

export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: formValues(formData) };

  const supabase = await createUserClient();
  const next = safeNext(formData.get("next"));
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: absoluteUrl(`/auth/callback?next=${encodeURIComponent(next)}`),
    },
  });

  if (error) {
    if (error.code === "weak_password") return { fieldErrors: { password: error.message }, values: formValues(formData) };
    if (error.status === 429) return { error: "Too many attempts. Please wait a few minutes.", values: formValues(formData) };
    return { error: "We couldn't create your account. Please try again.", values: formValues(formData) };
  }

  // Same message whether or not the address already has an account (no account enumeration).
  return {
    ok: true,
    message: `Check ${parsed.data.email} for a confirmation link. You can sign in after confirming your email.`,
  };
}

export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: formValues(formData) };

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Please confirm your email address first. Check your inbox for the link.", values: formValues(formData) };
    }
    if (error.code === "user_banned") return { error: "This account has been suspended. Contact us for help." };
    if (error.status === 429) return { error: "Too many attempts. Please wait a few minutes.", values: formValues(formData) };
    return { error: "Email or password is incorrect.", values: formValues(formData) };
  }

  redirect(safeNext(formData.get("next")));
}

export async function signOut(): Promise<void> {
  const supabase = await createUserClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { fieldErrors: { email: "Enter a valid email address" }, values: formValues(formData) };

  const supabase = await createUserClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: absoluteUrl("/auth/callback?next=/reset-password"),
  });
  // Always the same answer, so the form cannot be used to discover accounts.
  return { ok: true, message: "If an account exists for that address, we've sent a link to reset the password." };
}

export async function updatePassword(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0]?.message ?? "Invalid password" } };
  if (formData.get("password") !== formData.get("confirm")) return { fieldErrors: { confirm: "Passwords do not match" } };

  const supabase = await createUserClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Your reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: "Choose a password you haven't used here before" } };
    if (error.code === "reauthentication_needed") return { error: "Please request a new reset link and try again." };
    return { error: "We couldn't update your password. Please try again." };
  }
  redirect("/account?notice=password-updated");
}
