import Link from "next/link";
import { pageMetadata } from "@/lib/seo";

// Written against what the contracts and worker actually do. It has NOT had a
// legal review. Hector confirmed the three business decisions on 2026-09-11:
// PetID covers renewals (§5), purchases are final once registered (§6), and the
// LLC is a Delaware company (§14). On-chain today dogid.eth and catid.eth expire
// 2027-04-16 (grace to 2027-07-15) and every subname's expiry is capped at that
// date, so §5 depends on those renewals actually happening.
export const metadata = pageMetadata({
  title: "Terms of Service — PetID",
  description: "The terms for registering a PetID name, card purchases held for you, claims, refunds and your pet's public profile.",
  path: "/terms/",
  card: "home",
  imageAlt: "PetID: a permanent website for your pet",
});

const UPDATED = "September 11, 2026";
const CONTACT = "petid@onchain-id.id";

const h2: React.CSSProperties = { fontFamily: "'Fraunces',serif", fontSize: "22px", margin: "36px 0 10px", letterSpacing: "-0.01em" };
const p: React.CSSProperties = { margin: "0 0 12px" };
const a: React.CSSProperties = { color: "#C87A2E" };

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#FBF5EC", color: "#3D2817", fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap');*{box-sizing:border-box;}li{margin-bottom:6px;}`}</style>
      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 24px 96px", fontSize: "15px", lineHeight: 1.7 }}>
        <Link href="/" style={{ color: "#C87A2E", textDecoration: "none", fontWeight: 600 }}>🐾 PetID</Link>
        <h1 style={{ fontFamily: "'Fraunces',serif", fontSize: "36px", letterSpacing: "-0.02em", margin: "20px 0 4px" }}>Terms of Service</h1>
        <p style={{ ...p, color: "#8A6B4E" }}>Last updated {UPDATED}</p>

        <h2 style={h2}>1. About these terms</h2>
        <p style={p}>
          PetID is operated by Only Buy Bitcoin LLC (&quot;PetID&quot;, &quot;we&quot;). By using PetID, including this website, its
          IPFS gateways and the PetID partner widget, you agree to these terms and to our{" "}
          <Link href="/privacy/" style={a}>Privacy Policy</Link>. You must be at least 18, or use PetID with a parent or
          guardian&apos;s permission.
        </p>

        <h2 style={h2}>2. What PetID is</h2>
        <p style={p}>
          PetID lets you register a name under dogid.eth or catid.eth on the Ethereum Name Service (ENS), publish a profile
          page for your pet on IPFS, and print a QR code that links to it. PetID is not a government pet registry or a microchip
          database, and it doesn&apos;t replace microchipping, licensing or vaccination records.
        </p>

        <h2 style={h2}>3. Buying a name</h2>
        <ul>
          <li>The price is shown before you pay: $19.99, or the price a PetID partner sets on their own storefront.</li>
          <li>
            <strong>Crypto.</strong> You pay the USD price in ETH (converted at the live Chainlink ETH/USD rate when your
            transaction is processed) or in USDC. Ethereum network fees (&quot;gas&quot;) are extra and go to the network, not to us.
            Any ETH you send above the price is returned in the same transaction.
          </li>
          <li><strong>Card.</strong> You pay $19.99 on Stripe&apos;s checkout page. There are no network fees for you.</li>
          <li>Names are first come, first served, and each name can be registered only once.</li>
        </ul>

        <h2 style={h2}>4. Delivery, custody and claiming</h2>
        <p style={p}>
          <strong>Wallet purchases</strong> are delivered to the paying wallet in the same transaction that registers the name.
        </p>
        <p style={p}>
          <strong>Card purchases</strong> are registered right after payment and held for you by the PetID smart contract. Your
          pet&apos;s profile is live straight away. To receive the name, sign in on your account page with the Google account you
          used at checkout and claim it to a wallet. You&apos;ll sign a message with that wallet to prove it&apos;s yours. Claiming is
          free. <strong>A claim is permanent and can&apos;t be reversed</strong>, so make sure it&apos;s a wallet you control.
        </p>
        <p style={p}>
          While a name is held for you, we may revoke it if its payment is refunded, disputed or charged back, or if the purchase
          was fraudulent. Once a name has been claimed, we can&apos;t revoke it.
        </p>

        <h2 style={h2}>5. Your name once it&apos;s in your wallet</h2>
        <p style={p}>
          The name is an ENS token held in your wallet. Its protections are locked on-chain: neither PetID nor the owner of
          dogid.eth or catid.eth can take it back or change who owns it. You alone control it, and if you lose access to your
          wallet we can&apos;t recover the name for you.
        </p>
        <p style={p}>
          Every ENS name has an expiry date, and a PetID name&apos;s expiry follows its parent name (dogid.eth or catid.eth). You
          never pay a renewal fee: PetID renews the parent names at its own cost and extends PetID names&apos; expiry as it does.
        </p>

        <h2 style={h2}>6. Refunds</h2>
        <p style={p}>
          If we can&apos;t register a name you paid for by card (for example, because someone registered it first), we refund your
          card in full automatically. Otherwise, because a registration is recorded on a public blockchain and can&apos;t be undone,
          purchases are final once the name is registered, except where the law requires otherwise. Crypto transactions are final
          once confirmed. If something went wrong, email <a href={`mailto:${CONTACT}`} style={a}>{CONTACT}</a>.
        </p>

        <h2 style={h2}>7. Your pet&apos;s profile</h2>
        <p style={p}>
          You&apos;re responsible for what you put on your pet&apos;s profile. It is published on IPFS, where it is public and may
          remain permanently (see the <Link href="/privacy/" style={a}>Privacy Policy</Link>). Only publish information you have
          the right to share. Don&apos;t publish anything unlawful, infringing, hateful or misleading, or anyone else&apos;s personal
          information without their consent. We may stop hosting content that breaks these terms, and clear or revoke names still
          held for you, but copies on IPFS may persist beyond our control.
        </p>

        <h2 style={h2}>8. Names</h2>
        <p style={p}>
          Don&apos;t register names that impersonate someone, infringe a trademark or are offensive. We may refuse or refund a card
          order for such a name.
        </p>

        <h2 style={h2}>9. Blockchain risks and third parties</h2>
        <p style={p}>
          PetID relies on systems we don&apos;t control, including Ethereum, ENS, IPFS, wallets, and gateways such as eth.limo.
          Network fees and ETH prices change, smart contracts can have undiscovered flaws, and gateways can be slow or unavailable.
          You&apos;re responsible for your wallet and its security.
        </p>

        <h2 style={h2}>10. No warranty</h2>
        <p style={p}>
          PetID is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any kind, to the fullest extent the law
          allows.
        </p>

        <h2 style={h2}>11. Limitation of liability</h2>
        <p style={p}>
          To the fullest extent the law allows, we aren&apos;t liable for indirect, incidental or consequential damages, or for losses
          caused by lost wallet access, third-party networks or services, or events outside our control. Our total liability for any
          claim is limited to the amount you paid for the name the claim relates to.
        </p>

        <h2 style={h2}>12. Changes</h2>
        <p style={p}>
          We may update these terms. We&apos;ll change the date above when we do, and using PetID afterwards means you accept the
          updated terms.
        </p>

        <h2 style={h2}>13. Governing law</h2>
        <p style={p}>
          These terms are governed by the laws of the State of Delaware, United States, without regard to its conflict of
          law rules. Any dispute arising from them or from your use of PetID will be brought in the state or federal
          courts located in Delaware, and you and we consent to those courts&apos; jurisdiction.
        </p>

        <h2 style={h2}>14. Contact</h2>
        <p style={p}>
          Questions about these terms: <a href={`mailto:${CONTACT}`} style={a}>{CONTACT}</a>.
        </p>
      </main>
    </div>
  );
}
