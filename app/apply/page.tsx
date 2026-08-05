import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { ApplyRedirect } from "./ApplyRedirect";

/**
 * /apply/ is a shareable shortcut to the partner program — short enough to say
 * out loud or print on a flyer.
 *
 * There's no server to send a 302 from (the site is a static export on IPFS), so
 * the redirect is a meta refresh plus a JS replace. Scrapers read the markup
 * without following either, which is why this route carries its own share card
 * and why it's marked noindex: the destination is /partner/ and only one of them
 * should be in the index.
 */
export const metadata = pageMetadata({
  title: "Become a PetID partner — apply today",
  description:
    "Apply to sell PetID registrations at your clinic, pet shop, salon or shelter. Wholesale pricing, your own customer price, margin paid on-chain.",
  path: "/partner/",
  card: "apply",
  imageAlt: "Become a PetID partner — apply today",
  index: false,
});

export default function ApplyPage() {
  return (
    <>
      {/* Relative, not "/partner/": on a path-style gateway
          (gateway/ipfs/<cid>/apply/) a root-relative URL escapes the site
          entirely, while "../partner/" resolves correctly on both. */}
      <meta httpEquiv="refresh" content="0; url=../partner/" />
      <ApplyRedirect />
      <main style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        background: "#FBF5EC", color: "#3D2817", padding: "24px",
        fontFamily: "'Plus Jakarta Sans',system-ui,-apple-system,sans-serif",
      }}>
        <div style={{ textAlign: "center", maxWidth: "420px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px", background: "#C87A2E",
            display: "grid", placeItems: "center", margin: "0 auto 20px", color: "#FFFDF8",
          }}>
            <svg width="24" height="24" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
              <ellipse cx="20" cy="26" rx="9" ry="8"/><ellipse cx="9" cy="16" rx="4" ry="5"/><ellipse cx="31" cy="16" rx="4" ry="5"/><ellipse cx="15" cy="8" rx="3.2" ry="4"/><ellipse cx="25" cy="8" rx="3.2" ry="4"/>
            </svg>
          </div>
          <h1 style={{
            fontFamily: "'Fraunces',Georgia,serif", fontWeight: 600, fontSize: "26px",
            letterSpacing: "-.02em", margin: "0 0 10px",
          }}>
            Taking you to the partner program…
          </h1>
          <p style={{ color: "#5C3E25", fontSize: "15px", lineHeight: 1.6, margin: "0 0 22px" }}>
            If nothing happens, open the application page directly.
          </p>
          <Link href="/partner/" style={{
            display: "inline-flex", alignItems: "center", gap: "9px", padding: "14px 24px",
            borderRadius: "13px", background: "#C87A2E", color: "#FFFDF8",
            fontWeight: 700, fontSize: "15px", textDecoration: "none",
          }}>
            Apply today
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </Link>
        </div>
      </main>
    </>
  );
}
