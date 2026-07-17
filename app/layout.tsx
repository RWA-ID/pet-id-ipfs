import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "PetID — ENS Pet Identity Platform",
  description:
    "Create a permanent, decentralized profile for your pet. QR collar tags powered by ENS + IPFS.",
  verification: {
    google: "OtVg0C9NspzC28KBeFogk7gNEoAaVdJrJiPxoa7JuxY",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
