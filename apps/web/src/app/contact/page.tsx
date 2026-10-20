import { ContactForm } from "@/components/contact-form";
import { ContentPage, contentMetadata } from "@/components/content-page";
import { getSiteSettings } from "@/lib/public-data";

export const generateMetadata = () => contentMetadata("contact", "Contact us");

export default async function Page() {
  const settings = await getSiteSettings();
  return (
    <ContentPage slug="contact" fallbackTitle="Contact us">
      <ContactForm brandName={settings.brand_name} />
    </ContentPage>
  );
}
