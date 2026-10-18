import { describe, expect, it } from "vitest";
import {
  describeNotification,
  formatReviewTime,
  notificationPreferencesSchema,
  notificationWebHref,
  safeNotificationUrl,
} from "./notifications";

describe("describeNotification", () => {
  it("tells owners when to expect a review", () => {
    const text = describeNotification("listing_received", { listing_id: "abc", title: "Sunny flat", review_hours: 12 });
    expect(text.body).toContain("within 12 hours");
    expect(text.target).toEqual({ kind: "my_listing", id: "abc" });
  });

  it("explains each moderation decision", () => {
    expect(describeNotification("listing_decision", { decision: "approve", title: "A" }).title).toBe("Your listing is live");
    expect(describeNotification("listing_decision", { decision: "reject", title: "A", reason: "Add photos" }).body).toContain("Add photos");
  });

  it("does not open unsafe links from broadcasts", () => {
    expect(describeNotification("broadcast", { title: "Hi", body: "x", url: "javascript:alert(1)" }).target).toEqual({ kind: "none" });
    expect(describeNotification("broadcast", { title: "Hi", body: "x", url: "//evil.example" }).target).toEqual({ kind: "none" });
    expect(describeNotification("broadcast", { title: "Hi", body: "x", url: "/search?city=pune" }).target).toEqual({
      kind: "url",
      url: "/search?city=pune",
    });
  });

  it("falls back for unknown kinds and missing data", () => {
    expect(describeNotification("something_new", null).title).toBe("Notification");
    expect(describeNotification("enquiry_received", {}).target).toEqual({ kind: "none" });
  });
});

describe("helpers", () => {
  it("formats review times", () => {
    expect(formatReviewTime(1)).toBe("1 hour");
    expect(formatReviewTime(6)).toBe("6 hours");
    expect(formatReviewTime(48)).toBe("2 days");
  });

  it("maps targets to website paths", () => {
    expect(notificationWebHref({ kind: "enquiry", id: "e1" })).toBe("/account/enquiries/e1");
    expect(notificationWebHref({ kind: "none" })).toBeNull();
  });

  it("accepts only same-site paths and https links", () => {
    expect(safeNotificationUrl("https://example.com/x")).toBe("https://example.com/x");
    expect(safeNotificationUrl("http://example.com")).toBeNull();
  });
});

describe("notification preferences", () => {
  const base = { emailEnabled: true, pushEnabled: true, whatsappEnabled: false, alertsEnabled: true, quietHoursEnabled: true };

  it("normalises WhatsApp numbers", () => {
    const parsed = notificationPreferencesSchema.parse({ ...base, whatsappEnabled: true, whatsappNumber: "+91 98765-43210" });
    expect(parsed.whatsappNumber).toBe("+919876543210");
  });

  it("requires a number with country code for WhatsApp", () => {
    expect(notificationPreferencesSchema.safeParse({ ...base, whatsappEnabled: true }).success).toBe(false);
    expect(notificationPreferencesSchema.safeParse({ ...base, whatsappEnabled: true, whatsappNumber: "98765 43210" }).success).toBe(false);
  });
});
