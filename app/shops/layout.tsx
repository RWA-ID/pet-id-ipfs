import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "PetID for Pet Shops — earn $5 for every pet registered from your counter",
  description:
    "Put a free PetID flyer by your register. When a customer scans it and registers their pet by card, your shop earns $5. Free to join, nothing to stock, no crypto.",
  path: "/shops/",
  card: "partner",
  imageAlt: "PetID for pet shops — a free counter flyer that earns your shop $5 per registration",
});

export default function ShopsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
