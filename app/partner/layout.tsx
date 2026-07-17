import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PetID for Pet Shops & Vets — sell pet identities at your price",
  description:
    "Partner program for pet shops, vets and groomers: set your own price for PetID ENS registrations, embed a one-line widget, and earn the margin on-chain. Withdraw anytime.",
};

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
