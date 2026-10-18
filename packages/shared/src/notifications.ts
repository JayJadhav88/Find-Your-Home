// Notification preferences validation. Wording lives in notification-text.ts.

import { z } from "zod";

export * from "./notification-text";

/** Accepts "+91 98765 43210", "+91-98765-43210" and returns "+919876543210". */
export function normalizeWhatsappNumber(value: string): string {
  return value.replace(/[\s().-]/g, "");
}

export const notificationPreferencesSchema = z
  .object({
    emailEnabled: z.boolean(),
    pushEnabled: z.boolean(),
    whatsappEnabled: z.boolean(),
    whatsappNumber: z
      .string()
      .trim()
      .transform(normalizeWhatsappNumber)
      .refine((value) => value === "" || /^\+[1-9][0-9]{7,14}$/.test(value), {
        message: "Enter the number with country code, e.g. +91 98765 43210.",
      })
      .optional(),
    alertsEnabled: z.boolean(),
    quietHoursEnabled: z.boolean(),
    timezone: z.string().trim().max(64).optional(),
  })
  .refine((value) => !value.whatsappEnabled || Boolean(value.whatsappNumber), {
    message: "Add your WhatsApp number to get WhatsApp messages.",
    path: ["whatsappNumber"],
  });

export type NotificationPreferencesInput = z.input<typeof notificationPreferencesSchema>;

/** Shown next to the WhatsApp switch; the database records when it was accepted. */
export const WHATSAPP_CONSENT_TEXT =
  "I agree to receive messages about my account, listings and enquiries on WhatsApp. I can turn this off at any time.";
