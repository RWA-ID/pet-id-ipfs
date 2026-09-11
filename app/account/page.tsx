import { pageMetadata } from "@/lib/seo";
import { AccountClient } from "./AccountClient";

// Private to whoever signs in, so it stays out of the index.
export const metadata = pageMetadata({
  title: "Your PetID names",
  description: "Sign in to see the PetID names you bought by card and send them to your wallet.",
  path: "/account/",
  card: "register",
  imageAlt: "PetID: a permanent website for your pet",
  index: false,
});

export default function AccountPage() {
  return <AccountClient />;
}
