import { ContentPage, contentMetadata } from "@/components/content-page";

export const generateMetadata = () => contentMetadata("terms");

export default function Page() {
  return <ContentPage slug="terms" />;
}
