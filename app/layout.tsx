import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { SITE, SITE_NAME, TWITTER } from "@/lib/seo";
import { GA_MEASUREMENT_ID } from "@/lib/gtag";

// metadataBase is what lets every page write `canonical` and `og:image` as
// relative paths and still emit absolute URLs — share scrapers reject relative
// ones. Keep this a server component: a "use client" root layout can't export
// metadata at all, and hand-writing <head> there makes every route claim the
// homepage's og:url.
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "PetID — ENS Pet Identity Platform",
  description:
    "Create a permanent, decentralized profile for your pet. QR collar tags powered by ENS + IPFS.",
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: "/",
    title: "PetID — ENS Pet Identity Platform",
    description:
      "Create a permanent, decentralized profile for your pet. QR collar tags powered by ENS + IPFS.",
    images: [
      { url: "/og/home.png", width: 1200, height: 630, type: "image/png", alt: "PetID — a permanent website for your pet" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER,
    images: [{ url: "/og/home.png", alt: "PetID — a permanent website for your pet" }],
  },
  // Declared by hand rather than via app/icon.* — see scripts/icons/render.sh
  // for why (Turbopack decodes an app/favicon.ico and demands RGBA).
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
  },
  verification: {
    google: "OtVg0C9NspzC28KBeFogk7gNEoAaVdJrJiPxoa7JuxY",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased">
        {/* Google Analytics (gtag.js), on every route because the root layout is.
            Plain <script> rather than next/script: an afterInteractive script only runs
            if hydration succeeds, and this export is served from IPFS gateways where a
            slow chunk or a wallet-provider clash can leave React down on a page a reader
            still saw. These tags are in the emitted HTML and fire either way.

            Both origins below are allowlisted in scripts/inject-csp.mjs — without that
            the CSP blocks them silently. Client-side route changes are gtag's blind
            spot; <GoogleAnalytics /> below reports those. */}
        <script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`,
          }}
        />
        <Providers>{children}</Providers>
        <GoogleAnalytics />
      </body>
    </html>
  );
}
