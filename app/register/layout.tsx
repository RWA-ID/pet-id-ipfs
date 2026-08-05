import { pageMetadata } from "@/lib/seo";

// register/page.tsx is a client component, and client components can't export
// metadata — so the route's share card and canonical live here.
export const metadata = pageMetadata({
  title: "Register a PetID — mint your pet's ENS name",
  description:
    "Pick a name on dogid.eth or catid.eth, build your pet's profile, and mint it in one transaction. $19.99 in ETH or USDC, no renewals.",
  path: "/register/",
  card: "register",
  imageAlt: "PetID registration — choose a name on dogid.eth or catid.eth and mint it",
});

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
