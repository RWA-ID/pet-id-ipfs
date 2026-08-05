"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAccount, useDisconnect } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import {
  usePartnerInfo,
  usePartnerAdmin,
  useWholesalerStatus,
  REGISTRAR_ADDRESS,
} from "@/hooks/useRegistrarV4";

const SITE = "https://petid.eth.link";
const RESELLER_EMAIL = "petid@onchain-id.id";

/** Cloudflare Worker that receives partner applications (see worker/README.md).
 *  Unset in a fresh checkout — the form then falls back to email so the page is
 *  never a dead end. */
const APPLY_URL = process.env.NEXT_PUBLIC_PARTNER_APPLY_URL ?? "";

/** JSX text can't interpolate `${...}`, so format dollars through this. */
const usd = (n: number) => `$${n.toFixed(2)}`;

const PAW_SVG = (
  <svg width="20" height="20" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
    <ellipse cx="20" cy="26" rx="9" ry="8"/><ellipse cx="9" cy="16" rx="4" ry="5"/><ellipse cx="31" cy="16" rx="4" ry="5"/><ellipse cx="15" cy="8" rx="3.2" ry="4"/><ellipse cx="25" cy="8" rx="3.2" ry="4"/>
  </svg>
);

const ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
);

const BUSINESS_TYPES = [
  "Veterinary clinic",
  "Pet shop / supplies",
  "Grooming salon",
  "Shelter or rescue",
  "Breeder",
  "Trainer / daycare",
  "Other",
];

const VOLUMES = [
  "Under 10 per month",
  "10–50 per month",
  "50–200 per month",
  "200+ per month",
  "Not sure yet",
];

interface Application {
  businessName: string;
  businessType: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  website: string;
  volume: string;
  plannedPrice: string;
  notes: string;
}

const EMPTY: Application = {
  businessName: "", businessType: "", contactName: "", email: "", phone: "",
  city: "", country: "", website: "", volume: "", plannedPrice: "", notes: "",
};

const REQUIRED: (keyof Application)[] = [
  "businessName", "businessType", "contactName", "email", "city", "country",
];

/** One place that decides what an application looks like as plain text, so the
 *  worker payload and the email fallback can never drift apart. */
function applicationText(app: Application, wallet: string) {
  return [
    `Wallet:          ${wallet}`,
    `Business:        ${app.businessName}`,
    `Type:            ${app.businessType}`,
    `Contact:         ${app.contactName}`,
    `Email:           ${app.email}`,
    `Phone/WhatsApp:  ${app.phone || "—"}`,
    `Location:        ${[app.city, app.country].filter(Boolean).join(", ")}`,
    `Website:         ${app.website || "—"}`,
    `Expected volume: ${app.volume || "—"}`,
    `Planned price:   ${app.plannedPrice ? `$${app.plannedPrice}` : "—"}`,
    "",
    `Notes: ${app.notes || "—"}`,
  ].join("\n");
}

function CopyBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pt-copy">
      <div className="pt-copy-head">
        <span className="pt-mono-label">{label}</span>
        <button
          type="button"
          className="pt-copy-btn"
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={copied ? { color: "#2D7D46" } : undefined}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre className="pt-code">{code}</pre>
    </div>
  );
}

export default function PartnerPage() {
  const { address, isConnected } = useAccount();
  const { open: openConnectModal } = useAppKit();
  const { disconnect } = useDisconnect();
  const info = usePartnerInfo(address);
  const admin = usePartnerAdmin();
  const { approved, isLoading: statusLoading } = useWholesalerStatus();

  // ── listing admin (approved resellers) ──
  const [priceUsd, setPriceUsd] = useState("");
  const [bizName, setBizName] = useState("");
  const [txMsg, setTxMsg] = useState("");

  // ── application ──
  const [app, setApp] = useState<Application>(EMPTY);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [sendError, setSendError] = useState("");
  const [alreadyApplied, setAlreadyApplied] = useState(false);

  const storageKey = address ? `petid.partner.application.${address.toLowerCase()}` : "";

  // An application is a one-off — remember it per wallet so a returning partner
  // sees "we have it" instead of a blank form they'll fill in twice.
  useEffect(() => {
    if (!storageKey) { setAlreadyApplied(false); return; }
    setAlreadyApplied(!!localStorage.getItem(storageKey));
    setSendState("idle");
    setSendError("");
  }, [storageKey]);

  useEffect(() => {
    if (info.priceUsdCents && info.priceUsdCents > 0n && priceUsd === "")
      setPriceUsd((Number(info.priceUsdCents) / 100).toFixed(2));
    if (info.name && bizName === "") setBizName(info.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.priceUsdCents, info.name]);

  useEffect(() => {
    if (admin.isSuccess) { setTxMsg("✓ Confirmed on-chain"); info.refetch(); }
    else if (admin.isConfirming) setTxMsg("Confirming…");
    else if (admin.isPending) setTxMsg("Check your wallet…");
    else if (admin.error) setTxMsg(admin.error.message.slice(0, 120));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.isSuccess, admin.isConfirming, admin.isPending, admin.error]);

  const isActive = !!info.priceUsdCents && info.priceUsdCents > 0n;
  // Wholesale is what a reseller pays the protocol per name. Never rendered
  // before the wallet is connected — it's partner pricing, not public pricing.
  const wholesaleUsd = info.wholesaleUsdCents ? Number(info.wholesaleUsdCents) / 100 : 14.99;
  const priceNum = parseFloat(priceUsd || "0");
  const marginUsd = priceNum > wholesaleUsd ? priceNum - wholesaleUsd : 0;
  const priceValid = priceNum >= wholesaleUsd;
  const priceCents = BigInt(Math.round(priceNum * 100));
  const hasEarnings = (info.accruedEth ?? 0n) > 0n || (info.accruedUsdc ?? 0n) > 0n;
  const registerUrl = `${SITE}/register/?partner=${address ?? "0xYOUR_WALLET"}`;

  const appText = useMemo(
    () => applicationText(app, address ?? ""),
    [app, address],
  );
  const mailtoHref = `mailto:${RESELLER_EMAIL}?subject=${encodeURIComponent(
    `PetID partner application — ${app.businessName || "new partner"}`,
  )}&body=${encodeURIComponent(appText)}`;

  const missing = REQUIRED.filter((k) => !app[k].trim());
  const canSubmit = missing.length === 0 && /.+@.+\..+/.test(app.email) && sendState !== "sending";

  async function submitApplication() {
    if (!canSubmit || !address) return;
    setSendState("sending");
    setSendError("");
    try {
      if (!APPLY_URL) throw new Error("No application endpoint is configured yet.");
      const res = await fetch(APPLY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...app, wallet: address, submittedAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`Server said ${res.status}: ${(await res.text()).slice(0, 140)}`);
      localStorage.setItem(storageKey, new Date().toISOString());
      setAlreadyApplied(true);
      setSendState("sent");
    } catch (e) {
      // Don't strand the applicant on a network or config failure — fall through
      // to email with everything they typed already formatted.
      setSendError(e instanceof Error ? e.message : String(e));
      setSendState("failed");
    }
  }

  const field = (k: keyof Application) => ({
    value: app[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setApp((p) => ({ ...p, [k]: e.target.value })),
  });

  return (
    <div className="pt-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        :root{--cream:#FBF5EC;--cream-2:#F5E6D0;--amber:#C87A2E;--amber-dark:#A35E1B;--amber-soft:#E8A962;--brown:#3D2817;--brown-2:#5C3E25;--brown-3:#8A6B4E;--line:#E5D3B6;--white:#FFFDF8;}
        *{box-sizing:border-box;}
        .pt-page{min-height:100vh;background:var(--cream);color:var(--brown);font-family:'Plus Jakarta Sans',system-ui,-apple-system,sans-serif;line-height:1.5;}
        .pt-shell{width:100%;max-width:1140px;margin:0 auto;padding:0 28px;}

        /* ── chrome ───────────────────────────────────────────────── */
        .pt-nav{position:sticky;top:0;z-index:20;background:rgba(251,245,236,.88);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(229,211,182,.55);}
        .pt-nav-inner{display:flex;align-items:center;justify-content:space-between;height:68px;}
        .pt-logo{display:inline-flex;align-items:center;gap:9px;font-family:'Fraunces',serif;font-weight:700;font-size:21px;color:var(--brown);text-decoration:none;}
        .pt-logo-mark{width:31px;height:31px;border-radius:9px;background:var(--amber);display:grid;place-items:center;color:var(--white);}
        .pt-pill{font-size:12px;font-weight:600;color:var(--brown-3);background:var(--cream-2);border-radius:999px;padding:3px 10px;font-family:'Plus Jakarta Sans',sans-serif;}
        .pt-nav-right{display:flex;align-items:center;gap:14px;}
        .pt-addr{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--brown-3);background:var(--cream-2);padding:5px 10px;border-radius:999px;}
        .pt-link-btn{background:none;border:none;cursor:pointer;font-size:13px;color:var(--brown-3);text-decoration:underline;font-family:inherit;padding:0;}
        .pt-nav-links{display:flex;gap:26px;font-size:14.5px;color:var(--brown-2);font-weight:500;}
        .pt-nav-links a{color:inherit;text-decoration:none;}
        .pt-nav-links a:hover{color:var(--amber-dark);}

        /* ── type ─────────────────────────────────────────────────── */
        .pt-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 13px 6px 8px;background:var(--white);border:1px solid var(--line);border-radius:999px;font-size:12.5px;font-weight:500;color:var(--brown-2);}
        .pt-eyebrow i{width:16px;height:16px;border-radius:50%;background:var(--amber);display:grid;place-items:center;color:var(--white);}
        h1.pt-h1{font-family:'Fraunces',serif;font-weight:600;font-size:clamp(38px,4.6vw,58px);line-height:1.02;letter-spacing:-.025em;margin:20px 0 18px;}
        h1.pt-h1 em{font-style:italic;font-weight:500;color:var(--amber-dark);}
        .pt-lede{font-size:17.5px;line-height:1.55;color:var(--brown-2);max-width:52ch;margin:0 0 30px;}
        .pt-h2{font-family:'Fraunces',serif;font-weight:600;font-size:26px;letter-spacing:-.02em;margin:0 0 8px;}
        .pt-h3{font-family:'Fraunces',serif;font-weight:600;font-size:18px;letter-spacing:-.01em;margin:0 0 5px;}
        .pt-body{font-size:14.5px;color:var(--brown-2);line-height:1.6;margin:0;}
        .pt-mono-label{font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--brown-3);}
        .pt-section-head{max-width:620px;margin:0 0 26px;}
        .pt-kicker{font-family:'JetBrains Mono',monospace;font-size:11.5px;text-transform:uppercase;letter-spacing:.12em;color:var(--amber-dark);margin-bottom:12px;}

        /* ── buttons ──────────────────────────────────────────────── */
        .pt-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:15px 26px;border-radius:13px;font-weight:700;font-size:15.5px;font-family:inherit;cursor:pointer;border:1.5px solid transparent;text-decoration:none;transition:transform .15s ease,background .15s ease;white-space:nowrap;}
        .pt-btn-primary{background:var(--amber);color:var(--white);box-shadow:0 8px 20px rgba(200,122,46,.3);}
        .pt-btn-primary:hover{background:var(--amber-dark);transform:translateY(-1px);}
        .pt-btn-outline{background:transparent;color:var(--brown);border-color:var(--brown);}
        .pt-btn-outline:hover{background:var(--brown);color:var(--white);}
        .pt-btn:disabled{opacity:.42;cursor:not-allowed;transform:none;box-shadow:none;}
        .pt-btn-block{width:100%;}
        .pt-cta-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center;}

        /* ── surfaces ─────────────────────────────────────────────── */
        .pt-card{background:var(--white);border:1px solid var(--line);border-radius:22px;padding:28px;box-shadow:0 2px 12px rgba(61,40,23,.06);}
        .pt-card-dark{background:var(--brown);border:none;color:var(--cream);}
        .pt-note{background:var(--cream-2);border-radius:12px;padding:13px 16px;font-size:13.5px;color:var(--brown-2);line-height:1.6;}
        .pt-band{padding:52px 0;}
        .pt-band-alt{background:var(--cream-2);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}

        /* ── hero ─────────────────────────────────────────────────── */
        .pt-hero{display:grid;grid-template-columns:1.08fr .92fr;gap:60px;align-items:center;padding:54px 0 60px;}
        .pt-trust{display:flex;gap:20px;flex-wrap:wrap;font-size:13.5px;color:var(--brown-3);margin-top:26px;}
        .pt-trust span{display:inline-flex;align-items:center;gap:7px;}
        .pt-check{width:15px;height:15px;border-radius:50%;background:var(--amber-soft);color:var(--white);display:inline-grid;place-items:center;font-size:9px;font-weight:700;}

        /* photo collage — the side space the old layout wasted */
        /* The two photos and the margin card overlap by design, but only over
           photo area — never over a caption. shot-b clears shot-a's caption via
           a positive gap (a negative one clipped it), and the card stops above
           shot-b's caption line rather than sitting on it. */
        .pt-collage{position:relative;padding-bottom:0;}
        .pt-shot{margin:0;background:var(--white);border:1px solid var(--line);border-radius:20px;padding:10px 10px 12px;box-shadow:0 6px 22px rgba(61,40,23,.10);}
        .pt-shot img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:13px;display:block;}
        .pt-shot figcaption{font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--brown-3);text-align:center;padding-top:9px;}
        .pt-shot-a{transform:rotate(-2deg);width:80%;}
        .pt-shot-b{transform:rotate(2.4deg);width:74%;margin-left:auto;margin-top:12px;}
        .pt-margin-card{position:absolute;left:0;bottom:48px;background:var(--brown);color:var(--cream);border-radius:18px;padding:16px 20px;box-shadow:0 10px 26px rgba(61,40,23,.22);transform:rotate(-1.5deg);}
        .pt-margin-card .pt-mono-label{color:rgba(251,245,236,.6);}
        .pt-margin-amt{font-family:'Fraunces',serif;font-weight:700;font-size:25px;color:var(--amber-soft);letter-spacing:-.02em;line-height:1.15;margin-top:5px;}
        .pt-margin-sub{font-size:11.5px;color:rgba(251,245,236,.62);margin-top:3px;}

        /* ── grids ────────────────────────────────────────────────── */
        .pt-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
        .pt-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
        .pt-step-num{font-family:'Fraunces',serif;font-weight:700;font-size:21px;color:var(--amber-dark);line-height:1;margin-bottom:12px;}
        .pt-list{margin:0;padding-left:19px;display:grid;gap:10px;font-size:14.5px;color:var(--brown-2);line-height:1.55;}
        .pt-list b{color:var(--brown);font-weight:600;}
        .pt-mono-inline{font-family:'JetBrains Mono',monospace;font-size:12.5px;}
        .pt-faq-item{padding:13px 0;border-top:1px dashed var(--line);}
        .pt-faq-item:first-child{border-top:none;padding-top:0;}
        .pt-faq-q{font-weight:700;font-size:14.5px;margin-bottom:4px;}

        /* ── form ─────────────────────────────────────────────────── */
        .pt-apply{display:grid;grid-template-columns:1.35fr .65fr;gap:24px;align-items:start;}
        .pt-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
        .pt-fw{grid-column:1/-1;}
        .pt-label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;}
        .pt-label span{color:var(--brown-3);font-weight:500;}
        .pt-input,.pt-select,.pt-textarea{width:100%;border:1.5px solid var(--line);border-radius:10px;padding:11px 14px;outline:none;font-size:15px;font-family:inherit;background:var(--white);color:var(--brown);}
        .pt-textarea{resize:vertical;min-height:84px;line-height:1.5;}
        .pt-select{appearance:none;background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none' stroke='%238A6B4E' stroke-width='2'%3E%3Cpath d='M1 1.5 6 6.5l5-5'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;padding-right:36px;}
        .pt-input:focus,.pt-select:focus,.pt-textarea:focus{border-color:var(--amber);box-shadow:0 0 0 3px rgba(200,122,46,.12);}
        .pt-prefix{position:relative;}
        .pt-prefix span{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--brown-3);font-size:15px;pointer-events:none;}
        .pt-prefix .pt-input{padding-left:27px;}
        .pt-aside{position:sticky;top:92px;display:grid;gap:16px;}
        .pt-wholesale{font-family:'Fraunces',serif;font-weight:700;font-size:32px;letter-spacing:-.02em;color:var(--brown);line-height:1;margin:6px 0 6px;}

        /* ── copy blocks ──────────────────────────────────────────── */
        .pt-copy{margin-bottom:16px;}
        .pt-copy:last-child{margin-bottom:0;}
        .pt-copy-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:12px;}
        .pt-copy-btn{background:transparent;border:1px solid var(--line);border-radius:8px;padding:4px 12px;font-size:12px;color:var(--brown-3);cursor:pointer;font-family:inherit;}
        .pt-copy-btn:hover{border-color:var(--amber);color:var(--amber-dark);}
        .pt-code{background:var(--brown);color:var(--cream);border-radius:12px;padding:14px 16px;font-size:12px;font-family:'JetBrains Mono',monospace;overflow-x:auto;white-space:pre-wrap;word-break:break-all;line-height:1.6;margin:0;}

        /* ── dashboard ────────────────────────────────────────────── */
        .pt-earn-row{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;}
        .pt-earn-amt{font-family:'Fraunces',serif;font-size:34px;font-weight:700;color:var(--white);line-height:1.1;display:block;}
        .pt-earn-amt small{font-size:16px;color:var(--amber-soft);font-weight:600;}
        .pt-dash{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;}
        .pt-foot-note{font-size:12.5px;color:var(--brown-3);line-height:1.6;text-align:center;padding:34px 0 60px;}
        .pt-foot-note a{color:var(--amber-dark);}
        .pt-status{font-size:13px;color:var(--brown-3);margin:12px 0 0;text-align:center;}
        .pt-ok{width:46px;height:46px;border-radius:50%;background:#E7F4EE;color:#2D7D46;display:grid;place-items:center;margin-bottom:14px;}

        @media(max-width:940px){
          .pt-hero{grid-template-columns:1fr;gap:44px;padding:40px 0 44px;}
          .pt-collage{max-width:460px;}
          .pt-grid-3,.pt-grid-2,.pt-dash,.pt-apply{grid-template-columns:1fr;}
          .pt-aside{position:static;}
          .pt-nav-links{display:none;}
        }
        @media(max-width:560px){
          .pt-shell{padding:0 20px;}
          .pt-form-grid{grid-template-columns:1fr;}
          .pt-shot-a,.pt-shot-b{width:100%;margin-left:0;transform:none;}
          .pt-shot-b{margin-top:16px;}
          .pt-margin-card{position:static;margin-top:18px;transform:none;}
          .pt-collage{padding-bottom:0;}
          .pt-cta-row .pt-btn{width:100%;}
        }
      `}</style>

      <header className="pt-nav">
        <div className="pt-shell pt-nav-inner">
          <Link href="/" className="pt-logo">
            <span className="pt-logo-mark">{PAW_SVG}</span>
            PetID <span className="pt-pill">Partners</span>
          </Link>
          {isConnected ? (
            <div className="pt-nav-right">
              <span className="pt-addr">{address?.slice(0,6)}…{address?.slice(-4)}</span>
              <button className="pt-link-btn" onClick={() => disconnect()}>Disconnect</button>
            </div>
          ) : (
            <nav className="pt-nav-links" aria-label="Partner program">
              <a href="#how">How it works</a>
              <a href="#customers">What customers get</a>
              <a href="#faq">FAQ</a>
            </nav>
          )}
        </div>
      </header>

      {!isConnected ? (
        /* ═══ 1 · Public pitch. No partner pricing is shown here. ═══════════ */
        <>
          <section className="pt-shell pt-hero">
            <div>
              <span className="pt-eyebrow">
                <i>
                  <svg width="10" height="10" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
                    <ellipse cx="20" cy="26" rx="9" ry="8"/><ellipse cx="9" cy="16" rx="4" ry="5"/><ellipse cx="31" cy="16" rx="4" ry="5"/><ellipse cx="15" cy="8" rx="3.2" ry="4"/><ellipse cx="25" cy="8" rx="3.2" ry="4"/>
                  </svg>
                </i>
                Now accepting partners
              </span>
              <h1 className="pt-h1">Sell PetID at <em>your</em> price.</h1>
              <p className="pt-lede">
                Vets, pet shops, groomers and shelters: register PetIDs for your customers at a partner wholesale rate, set the price you charge, and keep the difference. Your margin accrues on-chain — withdraw whenever you like, no invoices and no payout schedule.
              </p>
              <div className="pt-cta-row">
                <button className="pt-btn pt-btn-primary" onClick={() => openConnectModal()}>
                  Apply today {ARROW}
                </button>
                <a href="#how" className="pt-btn pt-btn-outline">See how it works</a>
              </div>
              <div className="pt-trust">
                <span><span className="pt-check">✓</span> Free to join</span>
                <span><span className="pt-check">✓</span> Non-custodial</span>
                <span><span className="pt-check">✓</span> No monthly fees</span>
              </div>
            </div>

            <div className="pt-collage" aria-hidden="true">
              <figure className="pt-shot pt-shot-a">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/vet.jpg" alt="" />
                <figcaption>At the clinic — a PetID with every checkup</figcaption>
              </figure>
              <figure className="pt-shot pt-shot-b">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/petshop.jpg" alt="" />
                <figcaption>At the counter — sell it like any accessory</figcaption>
              </figure>
              <div className="pt-margin-card">
                <div className="pt-mono-label">Your margin · per registration</div>
                <div className="pt-margin-amt">$10.00</div>
                <div className="pt-margin-sub">on a $24.99 listing · withdraw anytime</div>
              </div>
            </div>
          </section>

          <section className="pt-band pt-band-alt" id="how">
            <div className="pt-shell">
              <div className="pt-section-head">
                <div className="pt-kicker">How it works</div>
                <h2 className="pt-h2">Three steps, one transaction.</h2>
              </div>
              <div className="pt-grid-3">
                {[
                  ["01", "Apply with your wallet", "Connect the wallet that should receive your earnings and send us your business details. We approve reseller access per wallet, so nobody can buy at partner rates without being a real business."],
                  ["02", "Set your price, share your link", "Once approved you choose what customers pay, in dollars. Every partner gets a personal registration link plus a one-line website widget — attribution happens inside the transaction, so it can't be faked or forgotten."],
                  ["03", "Earnings accrue on-chain", "Your margin from every registration builds up in the registrar contract under your address, in whichever asset the customer paid with. Withdraw whenever you like — no minimums, nobody to ask."],
                ].map(([n, title, body]) => (
                  <div className="pt-card" key={n}>
                    <div className="pt-step-num">{n}</div>
                    <h3 className="pt-h3">{title}</h3>
                    <p className="pt-body">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="pt-band" id="customers">
            <div className="pt-shell pt-grid-2">
              <div className="pt-card">
                <h2 className="pt-h2">What your customers get</h2>
                <p className="pt-body" style={{marginBottom:"16px"}}>
                  A PetID is a permanent digital identity for a dog or cat — a real product you can sell at the counter, at checkout, or during a visit:
                </p>
                <ul className="pt-list">
                  <li><b>An ENS name of their own</b> — <span className="pt-mono-inline">max.dogid.eth</span> or <span className="pt-mono-inline">luna.catid.eth</span>, owned by their wallet forever. No renewals.</li>
                  <li><b>A profile page hosted on IPFS</b> — photo, bio, health info, vet contact and emergency notes, in one of four designs.</li>
                  <li><b>A printable QR collar tag</b> — anyone who finds the pet scans it and reaches the owner with one tap: call, WhatsApp, Telegram or email.</li>
                </ul>
              </div>
              <div className="pt-card">
                <h2 className="pt-h2">What you get</h2>
                <p className="pt-body" style={{marginBottom:"16px"}}>
                  Everything a reseller needs, and nothing to install:
                </p>
                <ul className="pt-list">
                  <li><b>Wholesale pricing</b> — your rate is shown in your dashboard as soon as you connect an approved wallet.</li>
                  <li><b>A dashboard you control</b> — change your price or business name instantly, as often as you like.</li>
                  <li><b>A one-line widget</b> — a script tag renders the PetID button; an iframe embeds the whole flow. About 3&nbsp;kB, no build tools.</li>
                  <li><b>Earnings only you can claim</b> — margin sits in a verified contract under your address. PetID cannot touch it.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="pt-band pt-band-alt" id="faq">
            <div className="pt-shell">
              <div className="pt-section-head">
                <div className="pt-kicker">FAQ</div>
                <h2 className="pt-h2">Common questions.</h2>
              </div>
              <div className="pt-grid-2">
                <div className="pt-card">
                  {[
                    ["Do I need to understand crypto?", "You need a wallet (MetaMask, Coinbase Wallet, etc.) to receive earnings — that's it. Customers pay from their own wallets and the smart contract handles pricing, minting and your margin automatically."],
                    ["Does it cost anything to join?", "No signup fee and no subscription. Applying is free; going live afterwards is a single on-chain transaction costing a few cents of gas. PetID currently takes no cut of your margin."],
                    ["How long does approval take?", "We review applications by hand, usually within a couple of business days. We'll reply to the email address on your application, and access is enabled for the exact wallet you applied with."],
                  ].map(([q, a]) => (
                    <div className="pt-faq-item" key={q}>
                      <div className="pt-faq-q">{q}</div>
                      <p className="pt-body">{a}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-card">
                  {[
                    ["What do customers actually pay?", "Exactly the price you set, quoted in dollars. They choose ETH or USDC at checkout — USDC is the exact amount, and the ETH equivalent is calculated from the live rate with any excess refunded in the same transaction."],
                    ["When can I withdraw?", "Anytime. Your earnings sit in the registrar contract under your address — only you can withdraw them. The contract source is verified on Etherscan."],
                    ["Is this custodial?", "No. Registrations mint directly to the customer's wallet, and your margin is claimable only by your wallet. Setting your price to zero pauses your listing whenever you want."],
                  ].map(([q, a]) => (
                    <div className="pt-faq-item" key={q}>
                      <div className="pt-faq-q">{q}</div>
                      <p className="pt-body">{a}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-cta-row" style={{justifyContent:"center",marginTop:"34px"}}>
                <button className="pt-btn pt-btn-primary" onClick={() => openConnectModal()}>
                  🐾 Apply today {ARROW}
                </button>
              </div>
            </div>
          </section>
        </>
      ) : statusLoading ? (
        /* Don't guess. "Not approved" and "haven't checked yet" look identical
           from the boolean alone, and guessing wrong shows an approved partner
           an application form. */
        <section className="pt-shell" style={{padding:"64px 0",maxWidth:"560px"}}>
          <div className="pt-card" style={{textAlign:"center"}}>
            <div className="pt-mono-label">Checking your partner status…</div>
            <p className="pt-body" style={{marginTop:"10px"}}>
              Reading the registrar for {address?.slice(0,6)}…{address?.slice(-4)}.
            </p>
          </div>
        </section>
      ) : approved ? (
        /* ═══ 3 · Approved reseller dashboard ══════════════════════════════ */
        <section className="pt-shell" style={{padding:"40px 0 0"}}>
          <div className="pt-section-head">
            <div className="pt-kicker">Partner dashboard</div>
            <h2 className="pt-h2">{isActive ? "You're live." : "One step from live."}</h2>
            <p className="pt-body">
              Your wholesale rate is <b>{usd(wholesaleUsd)}</b> per registration. Everything a customer pays above it is yours.
            </p>
          </div>

          <div className="pt-card pt-card-dark" style={{marginBottom:"20px"}}>
            <div className="pt-mono-label" style={{color:"rgba(251,245,236,.6)"}}>Available to withdraw</div>
            <div className="pt-earn-row" style={{marginTop:"12px"}}>
              <div>
                <span className="pt-earn-amt">
                  {info.accruedUsdc !== undefined ? (Number(info.accruedUsdc) / 1e6).toFixed(2) : "…"}
                  <small> USDC</small>
                </span>
                <span className="pt-earn-amt">
                  {info.accruedEth !== undefined ? (Number(info.accruedEth) / 1e18).toFixed(5) : "…"}
                  <small> ETH</small>
                </span>
              </div>
              <button className="pt-btn pt-btn-primary" onClick={() => admin.withdraw()} disabled={!hasEarnings}>
                Withdraw all
              </button>
            </div>
            <div style={{fontSize:"12.5px",color:"rgba(251,245,236,.55)",marginTop:"14px",lineHeight:1.55}}>
              Customers choose how to pay, so your margin accrues in whichever asset they used. One withdrawal claims both.
            </div>
          </div>

          <div className="pt-dash">
            <div className="pt-card">
              <h2 className="pt-h2">{isActive ? "Your listing" : "Activate your listing"}</h2>
              <p className="pt-body" style={{marginBottom:"20px"}}>
                {isActive
                  ? "Update your price or display name anytime — changes apply instantly."
                  : "Set your business name and the total price customers pay. One transaction and you're live."}
              </p>
              <div style={{display:"grid",gap:"14px",marginBottom:"18px"}}>
                <div>
                  <label className="pt-label" htmlFor="biz">Business name</label>
                  <input id="biz" className="pt-input" value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Happy Paws Clinic" maxLength={48}/>
                </div>
                <div>
                  <label className="pt-label" htmlFor="price">Customer price (USD)</label>
                  <div className="pt-prefix">
                    <span>$</span>
                    <input id="price" className="pt-input" type="number" min={wholesaleUsd} step="1" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} placeholder="24.99"/>
                  </div>
                </div>
              </div>
              <div className="pt-note" style={{marginBottom:"18px"}}>
                {priceValid
                  ? <>You pay PetID <b>{usd(wholesaleUsd)}</b> · You earn <b style={{color:"var(--amber-dark)"}}>{usd(marginUsd)}</b> per registration</>
                  : <>Price must be at least your {usd(wholesaleUsd)} wholesale cost</>}
              </div>
              <button
                className="pt-btn pt-btn-primary pt-btn-block"
                disabled={!priceValid || !bizName}
                onClick={() => admin.setPartnerPrice(priceCents, bizName)}
              >
                {isActive ? "Update listing" : "🐾 Go live"}
              </button>
              {txMsg && <p className="pt-status">{txMsg}</p>}
            </div>

            <div className="pt-card">
              <h2 className="pt-h2">Share &amp; embed</h2>
              <p className="pt-body" style={{marginBottom:"20px"}}>
                Customers who register through your link or widget pay your price — attribution is on-chain, automatic and unfakeable.
              </p>
              <CopyBlock label="Your registration link" code={registerUrl} />
              <CopyBlock label="Website button (script tag)" code={`<script src="https://unpkg.com/@petidentity/widget" data-partner="${address}"></script>`} />
              <CopyBlock label="Inline embed (iframe)" code={`<iframe src="${registerUrl}" style="width:100%;max-width:680px;height:760px;border:0;border-radius:16px;" title="PetID"></iframe>`} />
            </div>
          </div>

          <p className="pt-foot-note">
            Registrar contract:{" "}
            <a href={`https://etherscan.io/address/${REGISTRAR_ADDRESS}`} target="_blank" rel="noopener noreferrer">
              {REGISTRAR_ADDRESS ? `${REGISTRAR_ADDRESS.slice(0,8)}…${REGISTRAR_ADDRESS.slice(-6)}` : "deploying…"}
            </a>
            {" · "}Names mint from the same PetID registrar as direct registrations.
          </p>
        </section>
      ) : sendState === "sent" || (alreadyApplied && sendState === "idle") ? (
        /* ═══ 2b · Application received ════════════════════════════════════ */
        <section className="pt-shell" style={{padding:"48px 0 0",maxWidth:"720px"}}>
          <div className="pt-card">
            <div className="pt-ok">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <h2 className="pt-h2">Application received</h2>
            <p className="pt-body" style={{marginBottom:"18px"}}>
              Thanks — we have your details. We review applications by hand, usually within a couple of business days, and we&apos;ll reply by email. Reseller access is enabled for the exact wallet below, so keep using it when you come back.
            </p>
            <CopyBlock label="Wallet on your application" code={address ?? ""} />
            <div className="pt-note" style={{marginTop:"18px"}}>
              Once approved, this page turns into your dashboard: your wholesale rate of <b>{usd(wholesaleUsd)}</b> per registration, your own price, your registration link and your earnings.
            </div>
            <p className="pt-status" style={{marginTop:"18px"}}>
              Questions? <a href={`mailto:${RESELLER_EMAIL}`} style={{color:"var(--amber-dark)"}}>{RESELLER_EMAIL}</a>
              {" · "}
              <button className="pt-link-btn" onClick={() => { if (storageKey) localStorage.removeItem(storageKey); setAlreadyApplied(false); setSendState("idle"); }}>
                Send a new application
              </button>
            </p>
          </div>
          <p className="pt-foot-note">
            <Link href="/">← Back to petid.eth</Link>
          </p>
        </section>
      ) : (
        /* ═══ 2a · The application form ════════════════════════════════════ */
        <section className="pt-shell" style={{padding:"40px 0 0"}}>
          <div className="pt-section-head" style={{maxWidth:"680px"}}>
            <div className="pt-kicker">Partner application</div>
            <h2 className="pt-h2">Tell us about your business.</h2>
            <p className="pt-body">
              Reseller access is approved per wallet, so we need to know who we&apos;re approving. It takes a minute and costs nothing.
            </p>
          </div>

          <div className="pt-apply">
            <div className="pt-card">
              <div className="pt-form-grid">
                <div className="pt-fw">
                  <label className="pt-label" htmlFor="a-biz">Business name</label>
                  <input id="a-biz" className="pt-input" placeholder="Happy Paws Clinic" maxLength={64} {...field("businessName")}/>
                </div>
                <div>
                  <label className="pt-label" htmlFor="a-type">Type of business</label>
                  <select id="a-type" className="pt-select" {...field("businessType")}>
                    <option value="">Choose one…</option>
                    {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="pt-label" htmlFor="a-vol">Expected registrations <span>(optional)</span></label>
                  <select id="a-vol" className="pt-select" {...field("volume")}>
                    <option value="">Choose one…</option>
                    {VOLUMES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="pt-label" htmlFor="a-name">Your name</label>
                  <input id="a-name" className="pt-input" placeholder="Dr. Ana Reyes" maxLength={64} {...field("contactName")}/>
                </div>
                <div>
                  <label className="pt-label" htmlFor="a-email">Email</label>
                  <input id="a-email" className="pt-input" type="email" placeholder="ana@happypaws.com" maxLength={96} {...field("email")}/>
                </div>
                <div>
                  <label className="pt-label" htmlFor="a-phone">Phone or WhatsApp <span>(optional)</span></label>
                  <input id="a-phone" className="pt-input" placeholder="+1 809 000 0000" maxLength={40} {...field("phone")}/>
                </div>
                <div>
                  <label className="pt-label" htmlFor="a-site">Website or social <span>(optional)</span></label>
                  <input id="a-site" className="pt-input" placeholder="happypawsclinic.com" maxLength={120} {...field("website")}/>
                </div>
                <div>
                  <label className="pt-label" htmlFor="a-city">City</label>
                  <input id="a-city" className="pt-input" placeholder="Santo Domingo" maxLength={64} {...field("city")}/>
                </div>
                <div>
                  <label className="pt-label" htmlFor="a-country">Country</label>
                  <input id="a-country" className="pt-input" placeholder="Dominican Republic" maxLength={64} {...field("country")}/>
                </div>
                <div className="pt-fw">
                  <label className="pt-label" htmlFor="a-price">Price you plan to charge <span>(optional)</span></label>
                  <div className="pt-prefix">
                    <span>$</span>
                    <input id="a-price" className="pt-input" type="number" min={0} step="1" placeholder="24.99" {...field("plannedPrice")}/>
                  </div>
                </div>
                <div className="pt-fw">
                  <label className="pt-label" htmlFor="a-notes">Anything else <span>(optional)</span></label>
                  <textarea id="a-notes" className="pt-textarea" placeholder="How you'd sell PetID, how many locations you run, questions for us…" maxLength={800} {...field("notes")}/>
                </div>
              </div>

              <div className="pt-note" style={{margin:"20px 0 18px"}}>
                Applying with wallet <b className="pt-mono-inline">{address?.slice(0,10)}…{address?.slice(-8)}</b>. Reseller access is granted to this exact address, so apply with the wallet that should receive your earnings.
              </div>

              <button className="pt-btn pt-btn-primary pt-btn-block" disabled={!canSubmit} onClick={submitApplication}>
                {sendState === "sending" ? "Sending…" : <>Submit application {ARROW}</>}
              </button>

              {missing.length > 0 && (
                <p className="pt-status">Still needed: {missing.length} field{missing.length > 1 ? "s" : ""}</p>
              )}

              {sendState === "failed" && (
                <div style={{marginTop:"20px"}}>
                  <div className="pt-note" style={{background:"#FBEBE4",marginBottom:"16px"}}>
                    We couldn&apos;t submit that automatically{sendError ? ` (${sendError})` : ""}. Send it by email instead — everything you typed is below, already formatted.
                  </div>
                  <a className="pt-btn pt-btn-primary pt-btn-block" href={mailtoHref} style={{marginBottom:"16px"}}>
                    Email the application
                  </a>
                  <CopyBlock label="Your application" code={appText} />
                  <CopyBlock label="Send it to" code={RESELLER_EMAIL} />
                </div>
              )}
            </div>

            <aside className="pt-aside">
              <div className="pt-card">
                <div className="pt-mono-label">Your wholesale rate</div>
                <div className="pt-wholesale">{usd(wholesaleUsd)}</div>
                <p className="pt-body">
                  What you pay PetID per registration once approved. You set what customers pay and keep every dollar above this.
                </p>
              </div>
              <div className="pt-card">
                <h3 className="pt-h3">What happens next</h3>
                <ol className="pt-list" style={{paddingLeft:"18px"}}>
                  <li>We review by hand — usually a couple of business days.</li>
                  <li>We reply to your email and enable reseller access for this wallet.</li>
                  <li>You come back, set your price, and go live in one transaction.</li>
                </ol>
              </div>
              <div className="pt-card">
                <h3 className="pt-h3">Already approved?</h3>
                <p className="pt-body">
                  Make sure you&apos;re connected with the exact wallet we approved — this page becomes your dashboard automatically.
                </p>
              </div>
            </aside>
          </div>

          <p className="pt-foot-note">
            Registrar contract:{" "}
            <a href={`https://etherscan.io/address/${REGISTRAR_ADDRESS}`} target="_blank" rel="noopener noreferrer">
              {REGISTRAR_ADDRESS ? `${REGISTRAR_ADDRESS.slice(0,8)}…${REGISTRAR_ADDRESS.slice(-6)}` : "deploying…"}
            </a>
            {" · "}Verified on Etherscan · Names mint from the same PetID registrar as direct registrations.
          </p>
        </section>
      )}
    </div>
  );
}
