"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useDisconnect } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import {
  usePartnerInfo,
  usePartnerAdmin,
  useIsWholesaler,
  formatUsd,
  formatEth,
  formatUsdc,
  REGISTRAR_ADDRESS,
} from "@/hooks/useRegistrarV4";

const SITE = "https://petid.eth.link";

const PAW_SVG = (
  <svg width="20" height="20" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
    <ellipse cx="20" cy="26" rx="9" ry="8"/><ellipse cx="9" cy="16" rx="4" ry="5"/><ellipse cx="31" cy="16" rx="4" ry="5"/><ellipse cx="15" cy="8" rx="3.2" ry="4"/><ellipse cx="25" cy="8" rx="3.2" ry="4"/>
  </svg>
);

/** JSX text can't interpolate `${...}`, so format dollars through this. */
const usd = (n: number) => `$${n.toFixed(2)}`;

const inputStyle: React.CSSProperties = {
  width:"100%", border:"1.5px solid #E5D3B6", borderRadius:"10px",
  padding:"10px 14px", outline:"none", fontSize:"15px", fontFamily:"inherit",
  background:"#FFFDF8", color:"#3D2817",
};

const RESELLER_EMAIL = "petid@onchain-id.id";

function CopyBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{marginBottom:"16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"11px",textTransform:"uppercase",letterSpacing:".1em",color:"#8A6B4E"}}>{label}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={{background:"transparent",border:"1px solid #E5D3B6",borderRadius:"8px",padding:"4px 12px",fontSize:"12px",color: copied ? "#2D7D46" : "#8A6B4E",cursor:"pointer",fontFamily:"inherit"}}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <pre style={{background:"#3D2817",color:"#FBF5EC",borderRadius:"12px",padding:"14px 16px",fontSize:"12px",fontFamily:"'JetBrains Mono',monospace",overflowX:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all",lineHeight:1.6,margin:0}}>{code}</pre>
    </div>
  );
}

export default function PartnerDashboard() {
  const { address, isConnected } = useAccount();
  const { open: openConnectModal } = useAppKit();
  const { disconnect } = useDisconnect();
  const info = usePartnerInfo(address);
  const admin = usePartnerAdmin();
  const approved = useIsWholesaler();

  const [priceUsd, setPriceUsd] = useState("");
  const [bizName, setBizName] = useState("");
  const [txMsg, setTxMsg] = useState("");

  // prefill form from on-chain state once loaded
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
  // Wholesale is what a reseller pays the protocol per name. $14.99 by default.
  const wholesaleUsd = info.wholesaleUsdCents ? Number(info.wholesaleUsdCents) / 100 : 14.99;
  const priceNum = parseFloat(priceUsd || "0");
  const marginUsd = priceNum > wholesaleUsd ? priceNum - wholesaleUsd : 0;
  const priceValid = priceNum >= wholesaleUsd;
  const priceCents = BigInt(Math.round(priceNum * 100));
  const hasEarnings =
    (info.accruedEth ?? 0n) > 0n || (info.accruedUsdc ?? 0n) > 0n;

  const registerUrl = `${SITE}/register/?partner=${address ?? "0xYOUR_WALLET"}`;
  const btnPrimary: React.CSSProperties = {
    display:"inline-flex",alignItems:"center",justifyContent:"center",gap:"10px",
    padding:"14px 24px",borderRadius:"12px",fontWeight:700,fontSize:"15px",
    fontFamily:"inherit",cursor:"pointer",border:"none",width:"100%",
    background:"#C87A2E",color:"#FFFDF8",
  };
  const card: React.CSSProperties = {
    background:"#FFFDF8",border:"1px solid #E5D3B6",borderRadius:"24px",
    padding:"32px",boxShadow:"0 2px 12px rgba(61,40,23,.07)",marginBottom:"20px",
  };

  return (
    <div style={{minHeight:"100vh",background:"#FBF5EC",fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif",color:"#3D2817"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;} button:hover{opacity:.92;}
        input:focus{border-color:#C87A2E !important;box-shadow:0 0 0 3px rgba(200,122,46,.12);}
      `}</style>

      <header style={{position:"sticky",top:0,zIndex:20,background:"rgba(251,245,236,.9)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(229,211,182,.5)"}}>
        <div style={{maxWidth:"800px",margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:"64px"}}>
          <Link href="/" style={{display:"inline-flex",alignItems:"center",gap:"8px",fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"20px",color:"#3D2817",textDecoration:"none"}}>
            <span style={{width:"30px",height:"30px",borderRadius:"9px",background:"#C87A2E",display:"grid",placeItems:"center",color:"#FFFDF8"}}>{PAW_SVG}</span>
            PetID <span style={{fontSize:"12px",fontWeight:600,color:"#8A6B4E",marginLeft:"4px",background:"#F5E6D0",borderRadius:"999px",padding:"3px 10px"}}>Partners</span>
          </Link>
          {isConnected && (
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"12px",color:"#8A6B4E",background:"#F5E6D0",padding:"5px 10px",borderRadius:"999px"}}>
                {address?.slice(0,6)}…{address?.slice(-4)}
              </span>
              <button onClick={() => disconnect()} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:"13px",color:"#8A6B4E",textDecoration:"underline"}}>Disconnect</button>
            </div>
          )}
        </div>
      </header>

      <div style={{maxWidth:"640px",margin:"0 auto",padding:"40px 24px 80px"}}>
        <h1 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"36px",letterSpacing:"-0.02em",margin:"0 0 10px"}}>
          Earn with PetID
        </h1>
        <p style={{color:"#5C3E25",fontSize:"16px",lineHeight:1.6,margin:"0 0 32px"}}>
          Pet shops, vets and groomers: buy PetID registrations at the {usd(wholesaleUsd)} reseller price, set your own customer price, and keep every dollar above it. Customers pay in ETH or USDC; your margin accrues on-chain — withdraw anytime, no invoices, no waiting.
        </p>

        {!isConnected ? (
          <>
            <div style={card}>
              <p style={{color:"#5C3E25",fontSize:"15px",margin:"0 0 24px",lineHeight:1.6}}>
                Connect the wallet that will receive your earnings to get started — going live takes one transaction.
              </p>
              <button style={btnPrimary} onClick={() => openConnectModal()}>Connect Wallet</button>
            </div>

            {/* At the clinic / at the counter */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:"18px",margin:"4px 0 20px"}}>
              {[
                { src: "/images/vet.jpg", alt: "Veterinarian examining a white kitten with a stethoscope", caption: "At the clinic — a PetID with every checkup", rotate: "-1.2deg" },
                { src: "/images/petshop.jpg", alt: "A young dog standing in a pet shop aisle", caption: "At the counter — sell it like any accessory", rotate: "1.2deg" },
              ].map((img) => (
                <figure key={img.src} style={{margin:0,background:"#FFFDF8",border:"1px solid #E5D3B6",borderRadius:"20px",padding:"10px 10px 12px",boxShadow:"0 2px 12px rgba(61,40,23,.08)",transform:`rotate(${img.rotate})`}}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.src} alt={img.alt} style={{width:"100%",aspectRatio:"3/2",objectFit:"cover",borderRadius:"12px",display:"block"}}/>
                  <figcaption style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"11px",color:"#8A6B4E",textAlign:"center",paddingTop:"10px"}}>
                    {img.caption}
                  </figcaption>
                </figure>
              ))}
            </div>

            {/* How it works */}
            <div style={card}>
              <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"22px",margin:"0 0 18px"}}>How it works</h2>
              {[
                ["01", "Set your price", `Choose what customers pay for a PetID registration, in dollars. You pay PetID the $${wholesaleUsd.toFixed(2)} reseller price — everything above it is your margin. Update your price or business name anytime, instantly.`],
                ["02", "Share your link or embed the widget", "Every partner gets a personal registration link plus a one-line website widget (button or full inline flow). Customers who come through it pay your price — attribution happens in the transaction itself, so it can't be faked or forgotten."],
                ["03", "Earnings accrue on-chain", "Your margin from every registration accumulates in the registrar contract under your wallet address, in whichever asset the customer paid with. Withdraw whenever you like — no minimums, no payout schedules, no invoices, no one to ask."],
              ].map(([n, title, body]) => (
                <div key={n} style={{display:"grid",gridTemplateColumns:"40px 1fr",gap:"14px",padding:"14px 0",borderTop: n === "01" ? "none" : "1px dashed #E5D3B6"}}>
                  <div style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"20px",color:"#A35E1B"}}>{n}</div>
                  <div>
                    <div style={{fontFamily:"'Fraunces',serif",fontWeight:600,fontSize:"17px",marginBottom:"4px"}}>{title}</div>
                    <div style={{fontSize:"14px",color:"#5C3E25",lineHeight:1.6}}>{body}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* What customers get */}
            <div style={card}>
              <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"22px",margin:"0 0 6px"}}>What your customers get</h2>
              <p style={{color:"#5C3E25",fontSize:"14px",margin:"0 0 16px",lineHeight:1.6}}>
                A PetID is a permanent digital identity for a dog or cat — a real product you can sell at the counter, at checkout, or during a vet visit:
              </p>
              <ul style={{margin:0,paddingLeft:"20px",display:"grid",gap:"10px",fontSize:"14px",color:"#5C3E25",lineHeight:1.55}}>
                <li><b style={{color:"#3D2817"}}>An ENS name of their own</b> — <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"12.5px"}}>max.dogid.eth</span> or <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"12.5px"}}>luna.catid.eth</span>, owned by their wallet forever. No renewals.</li>
                <li><b style={{color:"#3D2817"}}>A profile page hosted on IPFS</b> — photo, bio, health info, vet contact and emergency notes, in one of four designs.</li>
                <li><b style={{color:"#3D2817"}}>A printable QR collar tag</b> — anyone who finds the pet scans it and reaches the owner with one tap (call, WhatsApp, Telegram or email).</li>
              </ul>
            </div>

            {/* FAQ */}
            <div style={card}>
              <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"22px",margin:"0 0 18px"}}>Common questions</h2>
              {[
                ["Do I need to understand crypto?", "You need a wallet (MetaMask, Coinbase Wallet, etc.) to receive earnings — that's it. Your customers pay in ETH or USDC through their own wallets; the smart contract handles pricing, minting and your margin automatically."],
                ["Does it cost anything to join?", "No signup fee and no subscription. Reseller access is approved per wallet, then going live is a single on-chain transaction (a few cents of gas). PetID currently takes no cut of your margin."],
                ["What do customers actually pay?", `Exactly the price you set, quoted in dollars. They choose ETH or USDC at checkout — USDC is the exact amount, and the ETH equivalent is calculated from the live rate with any excess refunded in the same transaction.`],
                ["When can I withdraw?", "Anytime. Your earnings sit in the registrar contract under your address — only you can withdraw them, and PetID can't touch them. The contract source is verified on Etherscan."],
                ["Can I change my price later?", "Yes, instantly, as often as you like. Setting the price to zero pauses your listing. Because prices are held in dollars, they don't drift when the ETH rate moves."],
                ["Is this custodial?", "No. Registrations mint directly to the customer's wallet, and your margin is claimable only by your wallet. The contract is verified on Etherscan — see the link below."],
              ].map(([q, a], i) => (
                <div key={q} style={{padding:"12px 0",borderTop: i === 0 ? "none" : "1px dashed #E5D3B6"}}>
                  <div style={{fontWeight:700,fontSize:"14.5px",marginBottom:"4px"}}>{q}</div>
                  <div style={{fontSize:"14px",color:"#5C3E25",lineHeight:1.6}}>{a}</div>
                </div>
              ))}
            </div>

            <div style={{textAlign:"center"}}>
              <button style={{...btnPrimary,width:"auto",padding:"14px 32px"}} onClick={() => openConnectModal()}>🐾 Become a partner</button>
            </div>
          </>
        ) : !approved ? (
          /* Wholesale is an approved list — otherwise anyone could self-register
             for the reseller price and buy their own names at cost. */
          <div style={card}>
            <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"22px",margin:"0 0 8px"}}>
              Request reseller access
            </h2>
            <p style={{color:"#5C3E25",fontSize:"15px",margin:"0 0 18px",lineHeight:1.6}}>
              Resellers buy PetID registrations at <b>{usd(wholesaleUsd)}</b> and set their own
              customer price, keeping everything above it. Access is approved per wallet, so send us
              the address below and we&apos;ll enable it.
            </p>
            <CopyBlock label="Your wallet address" code={address ?? ""} />
            <a
              href={`mailto:${RESELLER_EMAIL}?subject=${encodeURIComponent("PetID reseller access")}&body=${encodeURIComponent(`Wallet: ${address ?? ""}\n\nBusiness name:\nType of business (vet / pet shop / groomer):\nCity:\n`)}`}
              style={{...btnPrimary, textDecoration:"none"}}
            >
              Request access by email
            </a>
            {/* mailto: silently does nothing on devices with no mail client
                configured, so the address has to be readable and copyable too —
                otherwise a dead button is a dead end. */}
            <p style={{fontSize:"13px",color:"#5C3E25",lineHeight:1.6,marginTop:"14px",marginBottom:"6px",textAlign:"center"}}>
              Button not working? Email us directly:
            </p>
            <CopyBlock label="Email" code={RESELLER_EMAIL} />
            <p style={{fontSize:"12.5px",color:"#8A6B4E",lineHeight:1.6,marginTop:"16px",marginBottom:0,textAlign:"center"}}>
              Include your wallet address above. Already approved? Make sure you&apos;re connected with the exact wallet you sent us.
            </p>
          </div>
        ) : (
          <>
            {/* Earnings */}
            <div style={{...card, background:"#3D2817", border:"none"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"11px",textTransform:"uppercase",letterSpacing:".1em",color:"rgba(251,245,236,.6)",marginBottom:"10px"}}>Available to withdraw</div>
              <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:"16px",flexWrap:"wrap"}}>
                <div style={{display:"grid",gap:"6px"}}>
                  <span style={{fontFamily:"'Fraunces',serif",fontSize:"36px",fontWeight:700,color:"#FFFDF8",lineHeight:1}}>
                    {info.accruedUsdc !== undefined ? (Number(info.accruedUsdc) / 1e6).toFixed(2) : "…"}
                    <span style={{fontSize:"17px",color:"#E8A962"}}> USDC</span>
                  </span>
                  <span style={{fontFamily:"'Fraunces',serif",fontSize:"36px",fontWeight:700,color:"#FFFDF8",lineHeight:1}}>
                    {info.accruedEth !== undefined ? (Number(info.accruedEth) / 1e18).toFixed(5) : "…"}
                    <span style={{fontSize:"17px",color:"#E8A962"}}> ETH</span>
                  </span>
                </div>
                <button
                  onClick={() => admin.withdraw()}
                  disabled={!hasEarnings}
                  style={{padding:"12px 22px",borderRadius:"12px",fontWeight:700,fontSize:"14px",fontFamily:"inherit",cursor:"pointer",border:"none",background:"#C87A2E",color:"#FFFDF8",opacity: hasEarnings ? 1 : 0.4}}
                >
                  Withdraw all
                </button>
              </div>
              <div style={{fontSize:"12px",color:"rgba(251,245,236,.55)",marginTop:"14px",lineHeight:1.5}}>
                Customers choose how to pay, so your margin accrues in whichever asset they used.
                One withdrawal claims both.
              </div>
            </div>

            {/* Pricing */}
            <div style={card}>
              <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"22px",margin:"0 0 6px"}}>
                {isActive ? "Your listing" : "Activate your listing"}
              </h2>
              <p style={{color:"#5C3E25",fontSize:"14px",margin:"0 0 20px",lineHeight:1.5}}>
                {isActive
                  ? "You're live. Update your price or display name anytime — changes apply instantly."
                  : "Set your business name and the total price customers pay. One transaction and you're live."}
              </p>
              <div style={{display:"grid",gap:"14px",marginBottom:"18px"}}>
                <div>
                  <label style={{display:"block",fontSize:"13px",fontWeight:600,marginBottom:"6px"}}>Business name</label>
                  <input style={inputStyle} value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Happy Paws Clinic" maxLength={48}/>
                </div>
                <div>
                  <label style={{display:"block",fontSize:"13px",fontWeight:600,marginBottom:"6px"}}>Customer price (USD)</label>
                  <div style={{position:"relative"}}>
                    <span style={{position:"absolute",left:"14px",top:"50%",transform:"translateY(-50%)",color:"#8A6B4E",fontSize:"15px",pointerEvents:"none"}}>$</span>
                    <input type="number" min={wholesaleUsd} step="1" style={{...inputStyle,paddingLeft:"26px"}} value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} placeholder="24.99"/>
                  </div>
                </div>
              </div>
              <div style={{background:"#F5E6D0",borderRadius:"12px",padding:"12px 16px",fontSize:"13px",color:"#5C3E25",marginBottom:"18px",lineHeight:1.6}}>
                {priceValid
                  ? <>You pay PetID <b>{usd(wholesaleUsd)}</b> · You earn <b style={{color:"#A35E1B"}}>{usd(marginUsd)}</b> per registration</>
                  : <>Price must be at least your {usd(wholesaleUsd)} wholesale cost</>}
              </div>
              <button
                style={{...btnPrimary, opacity: priceValid && bizName ? 1 : 0.4}}
                disabled={!priceValid || !bizName}
                onClick={() => admin.setPartnerPrice(priceCents, bizName)}
              >
                {isActive ? "Update listing" : "🐾 Go live"}
              </button>
              {txMsg && <p style={{fontSize:"13px",color:"#8A6B4E",marginTop:"12px",textAlign:"center"}}>{txMsg}</p>}
            </div>

            {/* Share & embed */}
            <div style={card}>
              <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"22px",margin:"0 0 6px"}}>Share &amp; embed</h2>
              <p style={{color:"#5C3E25",fontSize:"14px",margin:"0 0 20px",lineHeight:1.5}}>
                Customers who register through your link or widget pay your price — attribution is on-chain, automatic and unfakeable.
              </p>
              <CopyBlock label="Your registration link" code={registerUrl} />
              <CopyBlock label="Website button (script tag)" code={`<script src="https://unpkg.com/@petidentity/widget" data-partner="${address}"></script>`} />
              <CopyBlock label="Inline embed (iframe)" code={`<iframe src="${registerUrl}" style="width:100%;max-width:680px;height:760px;border:0;border-radius:16px;" title="PetID"></iframe>`} />
            </div>

            <p style={{fontSize:"12px",color:"#8A6B4E",lineHeight:1.6,textAlign:"center"}}>
              Registrar contract: <a href={`https://etherscan.io/address/${REGISTRAR_ADDRESS}`} target="_blank" rel="noopener noreferrer" style={{color:"#C87A2E"}}>{REGISTRAR_ADDRESS ? `${REGISTRAR_ADDRESS.slice(0,8)}…${REGISTRAR_ADDRESS.slice(-6)}` : "deploying…"}</a> · Names mint from the same PetID registrar as direct registrations.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
