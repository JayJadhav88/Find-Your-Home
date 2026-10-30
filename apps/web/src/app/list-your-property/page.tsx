import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui";
import { getBoostPlans, getSiteSettings } from "@/lib/public-data";

export const metadata: Metadata = {
  title: "List your property for free",
  description: "Sell or rent out your home without brokerage. List in 5 minutes with photos and video, get calls from genuine buyers and tenants.",
};

const START = "/list-your-property/start";

const STEPS = [
  { title: "Your details", text: "Sign up with Google or email and add your mobile number." },
  { title: "Your property", text: "Sell or rent, type, BHK, area, price and locality. That's it." },
  { title: "Photos & video", text: "Upload photos and a walkthrough video, or paste a YouTube link." },
  { title: "Go live", text: "We check it and publish it. Boost it to reach more people faster." },
];

const BENEFITS = [
  { icon: "₹0", title: "Zero brokerage", text: "List for free and talk to buyers and tenants directly. No middleman, no commission." },
  { icon: "✓", title: "Genuine leads", text: "Every caller leaves a verified name and phone number, and tells you when they plan to move." },
  { icon: "▶", title: "Photos and video", text: "Show your home properly with photos, walkthrough videos and YouTube tours." },
  { icon: "📷", title: "Professional shoot", text: "Ask our team for a photo and video shoot at a time that suits you." },
  { icon: "⚡", title: "Boost to the top", text: "Feature your property at the top of search results with a Featured badge." },
  { icon: "☎", title: "Every lead in one place", text: "See every enquiry, callback request and brochure download for your property in your account." },
];

const FAQ = [
  { q: "Is listing really free?", a: "Yes. Listing, photos, videos and enquiries are free. You only pay if you choose to boost your property." },
  { q: "How long does it take?", a: "About 5 minutes for the basics. You can add full details such as floor, parking, amenities and address later." },
  { q: "When does my property go live?", a: "Our team checks every new listing to keep the site free of fake ads. Most are approved within a day." },
  { q: "Will my phone number be public?", a: "No. Visitors first leave their own name and number, then see yours. You get every lead in your account." },
  { q: "How does Boost work?", a: "Pay once online (UPI, card or net banking). Your property shows at the top with a Featured badge for the days you choose. If it's not live yet, the boost starts when it's approved." },
];

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function ListYourPropertyPage() {
  const [settings, plans] = await Promise.all([getSiteSettings(), getBoostPlans()]);

  return (
    <>
      <section className="bg-brand text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="mb-3 inline-block rounded-full bg-accent px-3 py-1 text-sm font-semibold text-brand-strong">Free · No brokerage</p>
            <h1 className="text-3xl font-semibold leading-tight sm:text-5xl">Sell or rent out your property, faster.</h1>
            <p className="mt-4 max-w-xl text-lg text-white/85">
              List on {settings.brand_name} in 5 minutes. Add photos and video, and get calls from genuine buyers and tenants directly.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={START} variant="accent" className="min-h-12 px-6 text-base">
                Post your property free
              </ButtonLink>
              <ButtonLink href="#how-it-works" variant="secondary" className="min-h-12 px-6 text-base">
                How it works
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-white/75">Builders and agents welcome too.</p>
          </div>
          <ol className="grid gap-3 rounded-2xl bg-white/10 p-5 ring-1 ring-white/20">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-brand-strong">{index + 1}</span>
                <span>
                  <span className="block font-semibold">{step.title}</span>
                  <span className="text-sm text-white/80">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-semibold sm:text-3xl">Why owners list with us</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <li key={benefit.title} className="rounded-xl border border-border bg-surface p-5">
              <span aria-hidden className="flex size-11 items-center justify-center rounded-lg bg-brand-soft text-lg font-bold text-brand">
                {benefit.icon}
              </span>
              <h3 className="mt-3 font-semibold">{benefit.title}</h3>
              <p className="mt-1 text-sm text-text-muted">{benefit.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="how-it-works" className="bg-surface-muted">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-semibold sm:text-3xl">Live in 4 simple steps</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="rounded-xl bg-surface p-5 shadow-sm">
                <span className="text-sm font-semibold text-accent">Step {index + 1}</span>
                <h3 className="mt-1 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm text-text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-text-muted">
            Want to add everything at once (floor, parking, amenities, exact address)?{" "}
            <Link href="/account/listings/new" className="text-brand underline">
              Use the full form
            </Link>
            .
          </p>
        </div>
      </section>

      {plans.length ? (
        <section className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-semibold sm:text-3xl">Want more calls? Boost your property</h2>
          <p className="mt-2 max-w-2xl text-text-muted">
            Boosted properties appear at the top of search results with a Featured badge. Pay once, online. No subscription.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <li key={plan.id} className="flex flex-col gap-2 rounded-xl border-2 border-border bg-surface p-5">
                <span className="font-semibold">{plan.name}</span>
                <span className="text-3xl font-bold text-brand">{rupees(plan.price_paise)}</span>
                <span className="text-sm text-text-muted">{plan.description ?? `Featured for ${plan.days} days`}</span>
              </li>
            ))}
            <li className="flex flex-col gap-2 rounded-xl border-2 border-dashed border-border p-5">
              <span className="font-semibold">Free listing</span>
              <span className="text-3xl font-bold text-brand">₹0</span>
              <span className="text-sm text-text-muted">Photos, videos and unlimited enquiries. Boost any time later.</span>
            </li>
          </ul>
        </section>
      ) : null}

      <section className="bg-surface-muted">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <h2 className="text-2xl font-semibold sm:text-3xl">Questions owners ask</h2>
          <div className="mt-6 flex flex-col gap-3">
            {FAQ.map((item) => (
              <details key={item.q} className="rounded-xl bg-surface p-4 shadow-sm">
                <summary className="cursor-pointer font-semibold">{item.q}</summary>
                <p className="mt-2 text-text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-brand-strong text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Ready? It takes about 5 minutes.</h2>
            <p className="text-white/80">Free to list. Pay only if you boost.</p>
          </div>
          <ButtonLink href={START} variant="accent" className="min-h-12 px-6 text-base">
            Post your property free
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
