import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "PetID for Pet Shops & Vets — sell pet identities at your price",
  description:
    "Partner program for vets, pet shops, groomers and shelters: register PetIDs at a wholesale rate, set your own customer price, and keep the margin. It accrues on-chain — withdraw anytime.",
  path: "/partner/",
  card: "partner",
  imageAlt: "PetID partner program — your counter, your price, margin paid on-chain",
});

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
