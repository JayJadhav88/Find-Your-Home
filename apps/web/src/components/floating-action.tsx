import { getFloatingAction } from "@/lib/public-data";

const ICON: Record<string, string> = { whatsapp: "💬", phone: "📞", chat: "💬", calendar: "📅", home: "🏠", offer: "🏷️", video: "🎥" };

/** The admin-configured floating button (e.g. "Chat on WhatsApp"). Clicks are counted via /go/floating. */
export async function FloatingAction() {
  const action = await getFloatingAction();
  if (!action) return null;
  return (
    // A route handler that counts the click; a plain link avoids prefetching it.
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a
      href="/go/floating"
      className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand px-5 font-semibold text-white shadow-lg hover:bg-brand-strong ${
        action.position === "left" ? "left-4" : "right-4"
      }`}
    >
      <span aria-hidden>{ICON[action.icon] ?? "💬"}</span>
      {action.label}
    </a>
  );
}
