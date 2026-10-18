import { ContentPage, contentMetadata } from "@/components/content-page";

export const generateMetadata = () => contentMetadata("contact");

export default function Page() {
  return <ContentPage slug="contact" />;
}
