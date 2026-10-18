// Notification wording, shared by the website, the phone app and the delivery worker.
// The database stores only a kind and data; the words live here so they can be
// translated in one place. No imports: this file is copied verbatim into
// supabase/functions/_shared by `pnpm sync:functions` (a test checks the copy is current).

export type NotificationTarget =
  | { kind: "my_listing"; id: string }
  | { kind: "enquiry"; id: string }
  | { kind: "admin_listing"; id: string }
  | { kind: "url"; url: string }
  | { kind: "none" };

export interface NotificationText {
  title: string;
  body: string;
  target: NotificationTarget;
}

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** "12 hours", "2 days". */
export function formatReviewTime(hours: number): string {
  if (hours >= 48 && hours % 24 === 0) return `${hours / 24} days`;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** Only same-site paths and https links may be opened from a notification. */
export function safeNotificationUrl(value: unknown): string | null {
  const url = str(value);
  if (/^\/(?!\/)[^\s]*$/.test(url)) return url;
  if (/^https:\/\/[^\s]+$/.test(url)) return url;
  return null;
}

export function describeNotification(kind: string, data: Record<string, unknown> | null): NotificationText {
  const d = data ?? {};
  const title = str(d.title) || "your listing";
  const listingId = str(d.listing_id);
  const enquiryId = str(d.enquiry_id);
  const myListing: NotificationTarget = listingId ? { kind: "my_listing", id: listingId } : { kind: "none" };
  const enquiry: NotificationTarget = enquiryId ? { kind: "enquiry", id: enquiryId } : { kind: "none" };

  switch (kind) {
    case "listing_received": {
      const hours = typeof d.review_hours === "number" ? d.review_hours : null;
      return {
        title: "Listing received",
        body: hours
          ? `"${title}" is waiting for review. Listings are usually reviewed within ${formatReviewTime(hours)}; we'll let you know.`
          : `"${title}" is waiting for review; we'll let you know.`,
        target: myListing,
      };
    }
    case "listing_submitted":
      return {
        title: "New listing to review",
        body: `"${title}"${d.reference ? ` (${str(d.reference)})` : ""} is waiting for review.`,
        target: listingId ? { kind: "admin_listing", id: listingId } : { kind: "none" },
      };
    case "listing_decision": {
      const reason = str(d.reason);
      switch (str(d.decision)) {
        case "approve":
          return { title: "Your listing is live", body: `"${title}" was approved and is now visible to everyone.`, target: myListing };
        case "reinstate":
          return { title: "Your listing is live again", body: `"${title}" is visible again.`, target: myListing };
        case "suspend":
          return { title: "Your listing was paused", body: reason ? `"${title}": ${reason}` : `"${title}" is hidden for now.`, target: myListing };
        default:
          return {
            title: "Changes needed on your listing",
            body: reason ? `"${title}": ${reason}` : `"${title}" needs changes before it can be published.`,
            target: myListing,
          };
      }
    }
    case "enquiry_received":
      return {
        title: d.kind === "visit_request" ? "New visit request" : "New enquiry",
        body: `Someone is interested in "${title}".`,
        target: enquiry,
      };
    case "visit_response":
      return d.visit_status === "confirmed"
        ? { title: "Visit confirmed", body: "The lister confirmed your visit.", target: enquiry }
        : { title: "Visit declined", body: "The lister can't make that time. Try another time or send a message.", target: enquiry };
    case "visit_cancelled":
      return { title: "Visit cancelled", body: "A visitor cancelled their visit request.", target: enquiry };
    case "broadcast": {
      const url = safeNotificationUrl(d.url);
      return { title: str(d.title) || "News", body: str(d.body), target: url ? { kind: "url", url } : { kind: "none" } };
    }
    case "saved_search_match": {
      const count = typeof d.count === "number" ? d.count : 1;
      const url = safeNotificationUrl(d.url);
      return {
        title: count === 1 ? "A new home matches your search" : `${count} new homes match your search`,
        body: str(d.name) ? `Saved search: ${str(d.name)}` : "See what's new.",
        target: url ? { kind: "url", url } : { kind: "none" },
      };
    }
    case "listing_expiring":
      return {
        title: "Your listing expires soon",
        body: `"${title}" will be hidden ${str(d.expires_on) ? `on ${str(d.expires_on)}` : "soon"} unless you renew it.`,
        target: myListing,
      };
    case "integration_test":
      return {
        title: "Test message",
        body: `Your ${str(d.channel) || "notification"} setup works. You can ignore this message.`,
        target: { kind: "none" },
      };
    case "listing_expired":
      return { title: "Your listing has expired", body: `"${title}" is hidden. Renew it to show it again.`, target: myListing };
    default:
      return { title: "Notification", body: "", target: { kind: "none" } };
  }
}

/** Web routes for notification targets (the phone app has its own mapping). */
export function notificationWebHref(target: NotificationTarget): string | null {
  switch (target.kind) {
    case "my_listing":
      return `/account/listings/${target.id}`;
    case "enquiry":
      return `/account/enquiries/${target.id}`;
    case "admin_listing":
      return `/admin/listings/${target.id}`;
    case "url":
      return target.url;
    default:
      return null;
  }
}
