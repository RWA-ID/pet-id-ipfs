import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

// DRAFT, 2026-09-11. Describes what the code actually does; it has not had a
// legal review. Keep it in step with the code: a new service provider or a new
// field on the order row belongs here too.
export const metadata = pageMetadata({
  title: "Privacy Policy — PetID",
  description: "What PetID collects, what is public forever on IPFS and Ethereum, and who processes your data.",
  path: "/privacy/",
  card: "home",
  imageAlt: "PetID: a permanent website for your pet",
});

const UPDATED = "September 11, 2026";
const CONTACT = "petid@onchain-id.id";

const h2: React.CSSProperties = { fontFamily: "'Fraunces',serif", fontSize: "22px", margin: "36px 0 10px", letterSpacing: "-0.01em" };
const p: React.CSSProperties = { margin: "0 0 12px" };

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#FBF5EC", color: "#3D2817", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');*{box-sizing:border-box;}li{margin-bottom:6px;}`}</style>
      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 24px 96px", fontSize: "15px", lineHeight: 1.7 }}>
        <Link href="/" style={{ color: "#C87A2E", textDecoration: "none", fontWeight: 600 }}>🐾 PetID</Link>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: "36px", letterSpacing: "-0.02em", margin: "20px 0 4px" }}>Privacy Policy</h1>
        <p style={{ ...p, color: "#8A6B4E" }}>Last updated {UPDATED}</p>

        <p style={p}>
          PetID is operated by Only Buy Bitcoin LLC (&quot;we&quot;). This policy explains what we collect when you use
          PetID, what becomes public, and who helps us run the service. Questions: <a href={`mailto:${CONTACT}`} style={{ color: "#C87A2E" }}>{CONTACT}</a>.
        </p>

        <h2 style={h2}>Your pet&apos;s profile is public and permanent</h2>
        <p style={p}>
          Everything you enter in the profile form (your pet&apos;s details and photo, and the owner name, email, phone,
          WhatsApp and Telegram you choose to include) is published as a web page on IPFS and linked from your pet&apos;s
          ENS name, so that anyone who scans the collar tag can reach you. It is visible to anyone. IPFS and Ethereum are
          public, decentralized networks: we can stop hosting a page, but copies may remain on the network and we cannot
          delete them. Only include contact details you are comfortable making public.
        </p>

        <h2 style={h2}>What we collect</h2>
        <ul>
          <li><strong>Wallet purchases.</strong> Your wallet address and the transaction are recorded on Ethereum, which is public.</li>
          <li>
            <strong>Card purchases.</strong> When you sign in with Google we receive your Google account ID, name and email address.
            We store them with your order: the name you bought, its status, and the wallet you later send it to. We use this to
            register and hold your name, email your receipt, and let you claim it.
          </li>
          <li>
            <strong>Card details.</strong> Payments are processed by Stripe on Stripe&apos;s own checkout page. We never receive or store
            your card number. Stripe&apos;s handling of your payment information is described in{" "}
            <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#C87A2E" }}>Stripe&apos;s privacy policy</a>.
          </li>
          <li><strong>Partner applications.</strong> The business and contact details you submit, which we store and email to our team.</li>
          <li><strong>Technical data.</strong> Our hosting providers process IP addresses and request logs to deliver and protect the service.</li>
        </ul>
        <p style={p}>
          We don&apos;t use advertising or analytics trackers. Your browser stores a sign-in token for card orders; signing out removes it.
        </p>

        <h2 style={h2}>Who processes data for us</h2>
        <ul>
          <li>Stripe (card payments)</li>
          <li>Google (sign-in)</li>
          <li>Cloudflare (our backend services and order database)</li>
          <li>Pinata (IPFS hosting of photos and profile pages)</li>
          <li>Resend (receipts and notification emails)</li>
          <li>Alchemy (reading and writing the Ethereum blockchain)</li>
          <li>Reown / WalletConnect (connecting your wallet, if you use one)</li>
          <li>eth.limo (the gateway that serves this website)</li>
        </ul>
        <p style={p}>We don&apos;t sell your personal information. We share it only with these providers, to run PetID, or when the law requires.</p>

        <h2 style={h2}>How long we keep it</h2>
        <p style={p}>
          We keep order records for as long as we hold a name for you, and afterwards as long as needed for receipts, refunds,
          disputes and our legal obligations. To ask for a copy of your data, or for us to delete what isn&apos;t public on IPFS
          or Ethereum, email <a href={`mailto:${CONTACT}`} style={{ color: "#C87A2E" }}>{CONTACT}</a>.
        </p>

        <h2 style={h2}>Children</h2>
        <p style={p}>PetID isn&apos;t directed at children under 13, and we don&apos;t knowingly collect their information.</p>

        <h2 style={h2}>Changes</h2>
        <p style={p}>If we change this policy we&apos;ll update the date above.</p>
      </main>
    </div>
  );
}
