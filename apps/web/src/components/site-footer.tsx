import Link from "next/link";
import { getSiteSettings } from "@/lib/public-data";

export async function SiteFooter() {
  const settings = await getSiteSettings();
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-text-muted sm:flex-row sm:justify-between">
        <div>
          <p className="font-semibold text-text">{settings.brand_name}</p>
          {settings.contact_email ? (
            <p>
              <a className="underline" href={`mailto:${settings.contact_email}`}>
                {settings.contact_email}
              </a>
            </p>
          ) : null}
          {settings.contact_phone ? <p>{settings.contact_phone}</p> : null}
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-4">
          <Link href="/about" className="inline-block py-2 hover:underline">About</Link>
          <Link href="/contact" className="inline-block py-2 hover:underline">Contact</Link>
          <Link href="/privacy" className="inline-block py-2 hover:underline">Privacy</Link>
          <Link href="/terms" className="inline-block py-2 hover:underline">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
