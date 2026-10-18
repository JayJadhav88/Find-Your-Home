import { ContentPage, contentMetadata } from "@/components/content-page";

export const generateMetadata = () => contentMetadata("privacy");

export default function Page() {
  return <ContentPage slug="privacy" />;
}
