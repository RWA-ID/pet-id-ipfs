"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAccount, useDisconnect, useReadContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { namehash } from "viem/ens";
import { useDebounce } from "use-debounce";
import { useRegister } from "@/hooks/useRegister";
import { TEMPLATES } from "@/lib/templates/registry";
import { uploadFileToPinata, uploadHtmlToPinata, ipfsUrl } from "@/lib/pinata-browser";
import { cidToContenthash } from "@/lib/contenthash";
import { generateProfileHtml } from "@/lib/profile-html";
import type { Template } from "@/types/templates";

// ─── types ───────────────────────────────────────────────────────────────────
type Namespace = "dogid.eth" | "catid.eth";
type MintPhase =
  | "idle"
  | "uploading-photo"
  | "uploading-profile"
  | "waiting-wallet"
  | "confirming"
  | "done"
  | "error";

interface PetForm {
  // Identity
  name: string;
  breed: string;
  color: string;
  ageYears: string;
  sex: "male" | "female" | "unknown";
  microchip: string;
  // Health
  neutered: boolean;
  weight: string;
  vetName: string;
  vaccinated: boolean;
  emergencyNotes: string;
  // Personality
  bio: string;
  favFood: string;
  favToy: string;
  // Owner
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
}

const INITIAL_FORM: PetForm = {
  name: "", breed: "", color: "", ageYears: "", sex: "unknown", microchip: "",
  neutered: false, weight: "", vetName: "", vaccinated: false, emergencyNotes: "",
  bio: "", favFood: "", favToy: "",
  ownerName: "", ownerPhone: "", ownerEmail: "",
};

// ─── small helpers ────────────────────────────────────────────────────────────
const PAW_SVG = (
  <svg width="20" height="20" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <ellipse cx="20" cy="26" rx="9" ry="8" fill="currentColor"/>
    <ellipse cx="9" cy="16" rx="4" ry="5" fill="currentColor"/>
    <ellipse cx="31" cy="16" rx="4" ry="5" fill="currentColor"/>
    <ellipse cx="15" cy="8" rx="3.2" ry="4" fill="currentColor"/>
    <ellipse cx="25" cy="8" rx="3.2" ry="4" fill="currentColor"/>
  </svg>
);

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{display:"block",fontSize:"13px",fontWeight:600,color:"#3D2817",marginBottom:"6px"}}>
        {label}{required && <span style={{color:"#C87A2E",marginLeft:"3px"}}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width:"100%", border:"1.5px solid #E5D3B6", borderRadius:"10px",
  padding:"10px 14px", outline:"none", fontSize:"15px", fontFamily:"inherit",
  background:"#FFFDF8", color:"#3D2817",
};
const inputFocusStyle = `
  input:focus, select:focus, textarea:focus {
    border-color: #C87A2E !important;
    box-shadow: 0 0 0 3px rgba(200,122,46,.12);
  }
`;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"11px",textTransform:"uppercase",
      letterSpacing:"0.1em",color:"#8A6B4E",marginBottom:"16px",marginTop:"8px",fontWeight:500}}>
      {children}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function RegisterWizard() {
  const [step, setStep] = useState<number>(0);
  // step 0 = wallet gate, 1 = namespace+name, 2 = template, 3 = details, 4 = review, 5 = minting

  const [namespace, setNamespace] = useState<Namespace>("dogid.eth");
  const [subdomain, setSubdomain] = useState("");
  const [debouncedSub] = useDebounce(subdomain, 500);

  const [template, setTemplate] = useState<Template | null>(null);
  const [form, setForm] = useState<PetForm>(INITIAL_FORM);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [personalityOpen, setPersonalityOpen] = useState(false);

  const [mintPhase, setMintPhase] = useState<MintPhase>("idle");
  const [mintError, setMintError] = useState("");
  const [profileCid, setProfileCid] = useState("");
  const [txHash, setTxHash] = useState("");
  const qrRef = useRef<HTMLDivElement>(null);

  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const { register, fee, hash, isPending, isConfirming, isSuccess, error: wagmiError } = useRegister(namespace);

  const REGISTRAR_ADDRESS = process.env.NEXT_PUBLIC_PETID_REGISTRAR_ADDRESS as `0x${string}`;
  const IS_AVAILABLE_ABI = [{
    name: "isAvailable",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "parentNode", type: "bytes32" }, { name: "label", type: "string" }],
    outputs: [{ name: "available", type: "bool" }],
  }] as const;

  const { data: availableOnChain, isFetching: checking } = useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: IS_AVAILABLE_ABI,
    functionName: "isAvailable",
    args: [namehash(namespace) as `0x${string}`, debouncedSub],
    query: { enabled: debouncedSub.length >= 3 && isConnected },
  });

  const availability = debouncedSub.length >= 3
    ? { available: availableOnChain === true }
    : null;

  // sync wagmi tx state into mintPhase
  useEffect(() => {
    if (isPending) setMintPhase("waiting-wallet");
    if (isConfirming && hash) { setMintPhase("confirming"); setTxHash(hash); }
    if (isSuccess) setMintPhase("done");
    if (wagmiError && mintPhase !== "idle" && mintPhase !== "done") {
      setMintError(wagmiError.message.slice(0, 200));
      setMintPhase("error");
    }
  }, [isPending, isConfirming, isSuccess, wagmiError, hash, mintPhase]);

  // auto-advance to step 1 when wallet connects
  useEffect(() => {
    if (isConnected && step === 0) setStep(1);
  }, [isConnected, step]);

  // render QR code on success screen
  useEffect(() => {
    if (mintPhase !== "done" || !qrRef.current) return;
    const profileUrl = `https://${subdomain}.${namespace}.link`;
    qrRef.current.innerHTML = "";
    const size = 160;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
    script.onload = () => {
      if (!qrRef.current) return;
      qrRef.current.innerHTML = "";
      // @ts-expect-error QRCode loaded dynamically
      new window.QRCode(qrRef.current, {
        text: profileUrl,
        width: size,
        height: size,
        colorDark: "#3D2817",
        colorLight: "#ffffff",
        correctLevel: 2,
      });
    };
    if (!document.querySelector('script[src*="qrcodejs"]')) {
      document.head.appendChild(script);
    } else {
      script.onload(null as never);
    }
  }, [mintPhase, subdomain, namespace]);

  const handleSubdomainChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSubdomain(clean);
  };

  const handlePhotoChange = (file: File | null) => {
    setPhotoFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    } else {
      setPhotoPreview(null);
    }
  };

  const setField = (k: keyof PetForm, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  // ── mint pipeline ──
  const handleMint = async () => {
    if (!fee) {
      setMintError("Fee not loaded yet — please wait a moment and try again.");
      setMintPhase("error");
      return;
    }
    setMintPhase("uploading-photo");
    setMintError("");
    try {
      let photoCidUrl: string | undefined;
      if (photoFile) {
        const photoCid = await uploadFileToPinata(photoFile, `${subdomain}-photo`);
        photoCidUrl = ipfsUrl(photoCid);
      }

      setMintPhase("uploading-profile");
      const html = generateProfileHtml({
        name: form.name,
        ens: `${subdomain}.${namespace}`,
        photoUrl: photoCidUrl,
        breed: form.breed || undefined,
        color: form.color || undefined,
        ageYears: form.ageYears || undefined,
        sex: form.sex,
        microchip: form.microchip || undefined,
        neutered: form.neutered,
        weight: form.weight || undefined,
        vetName: form.vetName || undefined,
        vaccinated: form.vaccinated,
        favFood: form.favFood || undefined,
        favToy: form.favToy || undefined,
        bio: form.bio || undefined,
        emergencyNotes: form.emergencyNotes || undefined,
        ownerName: form.ownerName,
        ownerPhone: form.ownerPhone || undefined,
        ownerEmail: form.ownerEmail || undefined,
        ownerWallet: address,
        templateId: template?.id,
      });

      const pageCid = await uploadHtmlToPinata(html, `${subdomain}-petid.html`);
      setProfileCid(pageCid);

      const contenthash = cidToContenthash(pageCid);
      setMintPhase("waiting-wallet");
      await register(subdomain, contenthash);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMintError(msg.slice(0, 300));
      setMintPhase("error");
    }
  };

  const filteredTemplates = TEMPLATES.filter(
    (t) => t.species === (namespace === "dogid.eth" ? "dog" : "cat")
  );
  const ens = `${subdomain}.${namespace}`;
  const formValid = !!form.name && !!form.ownerName && !!form.ownerEmail;

  // ── styles ──
  const card: React.CSSProperties = {
    background:"#FFFDF8", border:"1px solid #E5D3B6", borderRadius:"24px",
    padding:"32px", boxShadow:"0 2px 12px rgba(61,40,23,.07)",
  };
  const btnPrimary: React.CSSProperties = {
    display:"inline-flex", alignItems:"center", justifyContent:"center", gap:"10px",
    padding:"14px 24px", borderRadius:"12px", fontWeight:700, fontSize:"15px",
    fontFamily:"inherit", cursor:"pointer", border:"none", width:"100%",
    background:"#C87A2E", color:"#FFFDF8",
    boxShadow:"0 1px 0 rgba(255,255,255,.2) inset,0 8px 20px rgba(200,122,46,.28)",
    transition:"background .15s",
  };
  const btnOutline: React.CSSProperties = {
    display:"inline-flex", alignItems:"center", justifyContent:"center", gap:"8px",
    padding:"12px 20px", borderRadius:"12px", fontWeight:600, fontSize:"14px",
    fontFamily:"inherit", cursor:"pointer", border:"1.5px solid #3D2817",
    background:"transparent", color:"#3D2817", transition:"all .15s",
  };
  const stepIndicator = (n: number) => ({
    width:"28px", height:"28px", borderRadius:"50%", display:"grid", placeItems:"center",
    fontSize:"12px", fontWeight:700,
    background: step >= n ? "#C87A2E" : "#E5D3B6",
    color: step >= n ? "#FFFDF8" : "#8A6B4E",
  } as React.CSSProperties);

  const STEP_LABELS = ["Wallet", "Name", "Template", "Details", "Review", "Mint"];

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#FBF5EC",fontFamily:"'Plus Jakarta Sans',system-ui,sans-serif",color:"#3D2817"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        ${inputFocusStyle}
        *{box-sizing:border-box;}
        button:hover{opacity:.92;}
        .ns-btn{padding:16px 12px;border-radius:14px;border:2px solid #E5D3B6;background:#FFFDF8;cursor:pointer;text-align:center;transition:all .15s;font-family:inherit;}
        .ns-btn.active{border-color:#C87A2E;background:#FEF3E5;}
        .tmpl-btn{padding:20px 16px;border-radius:16px;border:2px solid #E5D3B6;background:#FFFDF8;cursor:pointer;text-align:left;transition:all .15s;font-family:inherit;width:100%;}
        .tmpl-btn.active{border-color:#C87A2E;background:#FEF3E5;}
        .collapse-toggle{width:100%;display:flex;justify-content:space-between;align-items:center;padding:12px 0;border:none;background:transparent;cursor:pointer;font-family:inherit;font-weight:600;font-size:14px;color:#3D2817;}
        .phase-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #F5E6D0;}
        .phase-row:last-child{border-bottom:none;}
        .phase-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
      `}</style>

      {/* Nav */}
      <header style={{position:"sticky",top:0,zIndex:20,background:"rgba(251,245,236,.9)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(229,211,182,.5)"}}>
        <div style={{maxWidth:"800px",margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:"64px"}}>
          <Link href="/" style={{display:"inline-flex",alignItems:"center",gap:"8px",fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"20px",color:"#3D2817",textDecoration:"none"}}>
            <span style={{width:"30px",height:"30px",borderRadius:"9px",background:"#C87A2E",display:"grid",placeItems:"center",color:"#FFFDF8"}}>
              {PAW_SVG}
            </span>
            PetID
          </Link>
          {isConnected && (
            <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"12px",color:"#8A6B4E",background:"#F5E6D0",padding:"5px 10px",borderRadius:"999px"}}>
                {address?.slice(0,6)}…{address?.slice(-4)}
              </span>
              <button onClick={() => disconnect()} style={{background:"transparent",border:"none",cursor:"pointer",fontSize:"13px",color:"#8A6B4E",textDecoration:"underline"}}>
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      <div style={{maxWidth:"600px",margin:"0 auto",padding:"40px 24px 80px"}}>

        {/* Step indicator */}
        {mintPhase !== "done" && (
          <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"32px",justifyContent:"center"}}>
            {STEP_LABELS.map((label, i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:"6px"}}>
                <div style={stepIndicator(i)}>
                  {step > i ? "✓" : i + 1}
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div style={{width:"24px",height:"2px",background: step > i ? "#C87A2E" : "#E5D3B6",borderRadius:"1px"}}/>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── STEP 0: Connect Wallet ── */}
        {step === 0 && (
          <div style={card}>
            <div style={{textAlign:"center",marginBottom:"32px"}}>
              <div style={{width:"64px",height:"64px",borderRadius:"18px",background:"#C87A2E",display:"grid",placeItems:"center",margin:"0 auto 20px",color:"#FFFDF8"}}>
                <svg width="32" height="32" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
                  <ellipse cx="20" cy="26" rx="9" ry="8"/><ellipse cx="9" cy="16" rx="4" ry="5"/><ellipse cx="31" cy="16" rx="4" ry="5"/><ellipse cx="15" cy="8" rx="3.2" ry="4"/><ellipse cx="25" cy="8" rx="3.2" ry="4"/>
                </svg>
              </div>
              <h1 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"32px",letterSpacing:"-0.02em",margin:"0 0 10px"}}>
                Create a PetID
              </h1>
              <p style={{color:"#5C3E25",fontSize:"16px",lineHeight:1.6,margin:0}}>
                Connect your wallet to mint a permanent ENS identity for your dog or cat. The subdomain goes directly to your wallet — no middlemen.
              </p>
            </div>

            <div style={{background:"#F5E6D0",borderRadius:"14px",padding:"20px",marginBottom:"28px",fontSize:"14px",color:"#5C3E25",lineHeight:1.6}}>
              <strong style={{color:"#3D2817"}}>What happens when you mint:</strong>
              <ul style={{margin:"10px 0 0",paddingLeft:"18px",display:"grid",gap:"6px"}}>
                <li>Your pet photo + profile is uploaded to IPFS</li>
                <li>The ENS subdomain is registered to your wallet on-chain</li>
                <li>The contenthash is set — resolves instantly at <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"12px"}}>name.dogid.eth.link</span></li>
              </ul>
            </div>

            <button style={btnPrimary} onClick={openConnectModal}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M3 7V6a2 2 0 0 1 2-2h11"/><circle cx="16" cy="13" r="1.3" fill="currentColor"/></svg>
              Connect Wallet
            </button>

            <p style={{textAlign:"center",marginTop:"16px",fontSize:"12px",color:"#8A6B4E"}}>
              Supports MetaMask, WalletConnect, Coinbase Wallet &amp; more
            </p>
          </div>
        )}

        {/* ── STEP 1: Namespace + Subdomain ── */}
        {step === 1 && (
          <div style={card}>
            <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"28px",letterSpacing:"-0.02em",margin:"0 0 6px"}}>
              Name your pet
            </h2>
            <p style={{color:"#5C3E25",fontSize:"15px",margin:"0 0 28px"}}>Choose a namespace and pick a unique subdomain.</p>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"24px"}}>
              {(["dogid.eth","catid.eth"] as Namespace[]).map((ns) => (
                <button key={ns} className={`ns-btn${namespace === ns ? " active" : ""}`}
                  onClick={() => setNamespace(ns)}>
                  <div style={{fontSize:"28px",marginBottom:"6px"}}>{ns === "dogid.eth" ? "🐕" : "🐈"}</div>
                  <div style={{fontWeight:700,color:"#3D2817",fontSize:"14px"}}>{ns === "dogid.eth" ? "Dog" : "Cat"}</div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"11px",color:"#8A6B4E",marginTop:"2px"}}>{ns}</div>
                </button>
              ))}
            </div>

            <Field label="Subdomain" required>
              <div style={{display:"flex",alignItems:"center",border:"1.5px solid #E5D3B6",borderRadius:"10px",overflow:"hidden",background:"#FFFDF8",transition:"border-color .15s"}}>
                <input
                  type="text"
                  value={subdomain}
                  onChange={(e) => handleSubdomainChange(e.target.value)}
                  placeholder="max"
                  style={{flex:1,padding:"11px 14px",border:"none",outline:"none",fontSize:"16px",fontFamily:"'JetBrains Mono',monospace",background:"transparent",color:"#3D2817"}}
                />
                <span style={{padding:"11px 12px",fontFamily:"'JetBrains Mono',monospace",fontSize:"12px",color:"#8A6B4E",background:"#F5E6D0",borderLeft:"1px solid #E5D3B6",whiteSpace:"nowrap"}}>
                  .{namespace}
                </span>
              </div>
            </Field>

            {subdomain.length >= 3 && (
              <div style={{marginTop:"8px",fontSize:"13px"}}>
                {checking && <span style={{color:"#8A6B4E"}}>Checking…</span>}
                {!checking && availability?.available === true && (
                  <span style={{color:"#2D7D46",fontWeight:600}}>✓ Available!</span>
                )}
                {!checking && availability?.available === false && (
                  <span style={{color:"#C0392B",fontWeight:600}}>✗ Already taken — try another name</span>
                )}
              </div>
            )}

            <button
              style={{...btnPrimary, marginTop:"28px", opacity: availability?.available ? 1 : 0.4}}
              disabled={!availability?.available}
              onClick={() => setStep(2)}
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── STEP 2: Template ── */}
        {step === 2 && (
          <div style={card}>
            <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"28px",letterSpacing:"-0.02em",margin:"0 0 6px"}}>
              Pick a template
            </h2>
            <p style={{color:"#5C3E25",fontSize:"15px",margin:"0 0 24px"}}>Your pet's IPFS profile page will use this design.</p>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"28px"}}>
              {filteredTemplates.map((t) => (
                <button key={t.id} className={`tmpl-btn${template?.id === t.id ? " active" : ""}`}
                  onClick={() => setTemplate(t)}>
                  <div style={{fontSize:"36px",marginBottom:"10px",textAlign:"center"}}>
                    {t.species === "dog" ? "🐕" : "🐈"}
                  </div>
                  <div style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"16px",color:"#3D2817",marginBottom:"4px"}}>{t.name}</div>
                  <div style={{fontSize:"12px",color:"#8A6B4E",lineHeight:1.4}}>{t.description}</div>
                </button>
              ))}
            </div>

            <div style={{display:"flex",gap:"12px"}}>
              <button style={btnOutline} onClick={() => setStep(1)}>← Back</button>
              <button
                style={{...btnPrimary, opacity: template ? 1 : 0.4}}
                disabled={!template}
                onClick={() => setStep(3)}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Pet + Owner Details ── */}
        {step === 3 && (
          <div style={card}>
            <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"28px",letterSpacing:"-0.02em",margin:"0 0 6px"}}>
              Pet &amp; owner details
            </h2>
            <p style={{color:"#5C3E25",fontSize:"15px",margin:"0 0 24px"}}>
              This info is stored on IPFS and shown on your pet's profile page.
            </p>

            {/* Photo */}
            <div style={{marginBottom:"24px"}}>
              <SectionTitle>Photo</SectionTitle>
              {photoPreview && (
                <img src={photoPreview} alt="Pet preview"
                  style={{width:"100%",maxHeight:"220px",objectFit:"cover",borderRadius:"12px",border:"1px solid #E5D3B6",marginBottom:"10px"}}/>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                style={{fontSize:"14px",color:"#5C3E25",width:"100%"}}/>
            </div>

            {/* Identity */}
            <SectionTitle>Identity</SectionTitle>
            <div style={{display:"grid",gap:"14px",marginBottom:"20px"}}>
              <Field label="Pet Name" required>
                <input style={inputStyle} value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Max"/>
              </Field>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                <Field label="Breed">
                  <input style={inputStyle} value={form.breed} onChange={(e) => setField("breed", e.target.value)} placeholder="Golden Retriever"/>
                </Field>
                <Field label="Color / Markings">
                  <input style={inputStyle} value={form.color} onChange={(e) => setField("color", e.target.value)} placeholder="Golden, white chest"/>
                </Field>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px"}}>
                <Field label="Age (years)">
                  <input type="number" min="0" max="30" step="0.5" style={inputStyle}
                    value={form.ageYears} onChange={(e) => setField("ageYears", e.target.value)}/>
                </Field>
                <Field label="Sex">
                  <select style={inputStyle} value={form.sex} onChange={(e) => setField("sex", e.target.value as PetForm["sex"])}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </Field>
                <Field label="Microchip / Tag #">
                  <input style={inputStyle} value={form.microchip} onChange={(e) => setField("microchip", e.target.value)} placeholder="123456789"/>
                </Field>
              </div>
            </div>

            {/* Health — collapsible */}
            <div style={{borderTop:"1px solid #E5D3B6",marginBottom:"8px"}}>
              <button className="collapse-toggle" onClick={() => setHealthOpen(!healthOpen)}>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"11px",textTransform:"uppercase",letterSpacing:".1em",color:"#8A6B4E",fontWeight:500}}>Health</span>
                <span style={{fontSize:"18px",color:"#8A6B4E",lineHeight:1}}>{healthOpen ? "−" : "+"}</span>
              </button>
              {healthOpen && (
                <div style={{display:"grid",gap:"14px",paddingBottom:"16px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                    <Field label="Weight (lbs)">
                      <input type="number" min="0" step="0.5" style={inputStyle}
                        value={form.weight} onChange={(e) => setField("weight", e.target.value)} placeholder="65"/>
                    </Field>
                    <Field label="Vet / Clinic">
                      <input style={inputStyle} value={form.vetName} onChange={(e) => setField("vetName", e.target.value)} placeholder="Happy Paws Clinic"/>
                    </Field>
                  </div>
                  <div style={{display:"flex",gap:"24px"}}>
                    <label style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"14px",cursor:"pointer"}}>
                      <input type="checkbox" checked={form.neutered} onChange={(e) => setField("neutered", e.target.checked)} style={{accentColor:"#C87A2E",width:"16px",height:"16px"}}/>
                      Neutered / Spayed
                    </label>
                    <label style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"14px",cursor:"pointer"}}>
                      <input type="checkbox" checked={form.vaccinated} onChange={(e) => setField("vaccinated", e.target.checked)} style={{accentColor:"#C87A2E",width:"16px",height:"16px"}}/>
                      Vaccinations up to date
                    </label>
                  </div>
                  <Field label="Emergency Notes">
                    <textarea rows={3} style={{...inputStyle,resize:"none"}} value={form.emergencyNotes}
                      onChange={(e) => setField("emergencyNotes", e.target.value)}
                      placeholder="Allergies, medications, conditions…"/>
                  </Field>
                </div>
              )}
            </div>

            {/* Personality — collapsible */}
            <div style={{borderTop:"1px solid #E5D3B6",marginBottom:"8px"}}>
              <button className="collapse-toggle" onClick={() => setPersonalityOpen(!personalityOpen)}>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"11px",textTransform:"uppercase",letterSpacing:".1em",color:"#8A6B4E",fontWeight:500}}>Personality</span>
                <span style={{fontSize:"18px",color:"#8A6B4E",lineHeight:1}}>{personalityOpen ? "−" : "+"}</span>
              </button>
              {personalityOpen && (
                <div style={{display:"grid",gap:"14px",paddingBottom:"16px"}}>
                  <Field label="Bio">
                    <textarea rows={3} style={{...inputStyle,resize:"none"}} value={form.bio}
                      onChange={(e) => setField("bio", e.target.value)}
                      placeholder="Tell us about your pet…"/>
                  </Field>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                    <Field label="Favorite food">
                      <input style={inputStyle} value={form.favFood} onChange={(e) => setField("favFood", e.target.value)} placeholder="Chicken treats"/>
                    </Field>
                    <Field label="Favorite toy">
                      <input style={inputStyle} value={form.favToy} onChange={(e) => setField("favToy", e.target.value)} placeholder="Tennis ball"/>
                    </Field>
                  </div>
                </div>
              )}
            </div>

            {/* Owner */}
            <div style={{borderTop:"1px solid #E5D3B6",paddingTop:"8px",marginBottom:"20px"}}>
              <SectionTitle>Owner</SectionTitle>
              <div style={{display:"grid",gap:"14px"}}>
                <Field label="Your Name" required>
                  <input style={inputStyle} value={form.ownerName} onChange={(e) => setField("ownerName", e.target.value)} placeholder="John Smith"/>
                </Field>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                  <Field label="Phone">
                    <input type="tel" style={inputStyle} value={form.ownerPhone} onChange={(e) => setField("ownerPhone", e.target.value)} placeholder="+1 555 000 0000"/>
                  </Field>
                  <Field label="Email" required>
                    <input type="email" style={inputStyle} value={form.ownerEmail} onChange={(e) => setField("ownerEmail", e.target.value)} placeholder="you@example.com"/>
                  </Field>
                </div>
                <div style={{background:"#F5E6D0",borderRadius:"10px",padding:"10px 14px",fontSize:"13px",color:"#5C3E25",fontFamily:"'JetBrains Mono',monospace"}}>
                  Wallet: {address?.slice(0,8)}…{address?.slice(-6)}
                </div>
              </div>
            </div>

            <div style={{display:"flex",gap:"12px"}}>
              <button style={btnOutline} onClick={() => setStep(2)}>← Back</button>
              <button
                style={{...btnPrimary, opacity: formValid ? 1 : 0.4}}
                disabled={!formValid}
                onClick={() => setStep(4)}
              >
                Review →
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Review ── */}
        {step === 4 && (
          <div style={card}>
            <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"28px",letterSpacing:"-0.02em",margin:"0 0 6px"}}>
              Review &amp; mint
            </h2>
            <p style={{color:"#5C3E25",fontSize:"15px",margin:"0 0 24px"}}>Everything looks good? One transaction mints and sets the contenthash.</p>

            <div style={{background:"#FEF3E5",border:"1px solid #E8A962",borderRadius:"14px",padding:"16px 20px",marginBottom:"20px"}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"18px",fontWeight:700,color:"#A35E1B"}}>{ens}</div>
              <div style={{fontSize:"13px",color:"#8A6B4E",marginTop:"4px"}}>{form.name}&apos;s permanent ENS identity</div>
            </div>

            {[
              ["Pet name", form.name],
              ["Breed", form.breed || "—"],
              ["Age", form.ageYears ? `${form.ageYears} yrs` : "—"],
              ["Sex", form.sex],
              ["Microchip", form.microchip || "—"],
              ["Template", template?.name || "—"],
              ["Owner", form.ownerName],
              ["Email", form.ownerEmail],
              ["Photo", photoFile ? photoFile.name : "None"],
            ].map(([k, v]) => (
              <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px dashed #E5D3B6",fontSize:"14px"}}>
                <span style={{color:"#8A6B4E"}}>{k}</span>
                <span style={{fontWeight:600,color:"#3D2817",textAlign:"right",maxWidth:"60%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v}</span>
              </div>
            ))}

            <div style={{display:"flex",justifyContent:"space-between",padding:"12px 0",fontSize:"16px",fontWeight:700,color:"#3D2817",borderTop:"2px solid #E5D3B6",marginTop:"4px"}}>
              <span>Total</span>
              <span style={{fontFamily:"'JetBrains Mono',monospace",color:"#A35E1B"}}>
                {fee ? `${Number(fee) / 1e18} ETH` : "0.00825 ETH"} + gas
              </span>
            </div>

            <div style={{background:"#F5E6D0",borderRadius:"12px",padding:"14px",fontSize:"13px",color:"#5C3E25",lineHeight:1.5,marginTop:"16px",marginBottom:"24px"}}>
              <strong>What happens next:</strong> Your photo is uploaded to IPFS, the profile HTML is generated and pinned, then a single on-chain transaction registers <span style={{fontFamily:"'JetBrains Mono',monospace"}}>{ens}</span> to your wallet and sets the contenthash.
            </div>

            <div style={{display:"flex",gap:"12px"}}>
              <button style={btnOutline} onClick={() => setStep(3)}>← Back</button>
              <button
                style={{...btnPrimary, opacity: fee ? 1 : 0.4}}
                disabled={!fee}
                onClick={() => { setStep(5); handleMint(); }}
              >
                {fee ? "🐾 Mint PetID" : "Loading fee…"}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Minting ── */}
        {step === 5 && (
          <div style={card}>
            {mintPhase !== "done" ? (
              <>
                <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"28px",letterSpacing:"-0.02em",margin:"0 0 6px"}}>
                  {mintPhase === "error" ? "Something went wrong" : "Minting your PetID…"}
                </h2>
                <p style={{color:"#5C3E25",fontSize:"15px",margin:"0 0 28px"}}>
                  {mintPhase === "waiting-wallet" ? "Check your wallet and confirm the transaction." :
                   mintPhase === "confirming" ? "Transaction submitted — waiting for confirmation." :
                   mintPhase === "error" ? "You can go back and try again." :
                   "This takes a few moments, don't close the tab."}
                </p>

                {[
                  { phase: "uploading-photo", label: "Uploading photo to IPFS", done: ["uploading-profile","uploading-profile","waiting-wallet","confirming","done","error"].includes(mintPhase) },
                  { phase: "uploading-profile", label: "Generating & uploading profile page", done: ["waiting-wallet","confirming","done","error"].includes(mintPhase) },
                  { phase: "waiting-wallet", label: "Waiting for wallet confirmation", done: ["confirming","done"].includes(mintPhase) },
                  { phase: "confirming", label: "Confirming on-chain", done: (["done"] as MintPhase[]).includes(mintPhase) },
                ].map(({ phase, label, done }) => {
                  const active = mintPhase === phase;
                  const color = done ? "#2D7D46" : active ? "#C87A2E" : "#8A6B4E";
                  return (
                    <div key={phase} className="phase-row">
                      <div className="phase-dot" style={{background: done ? "#2D7D46" : active ? "#C87A2E" : "#E5D3B6"}}/>
                      <span style={{fontSize:"14px",fontWeight: active ? 600 : 400, color}}>{label}</span>
                      {active && mintPhase !== "error" && (
                        <span style={{marginLeft:"auto",fontSize:"12px",color:"#C87A2E",fontFamily:"'JetBrains Mono',monospace"}}>…</span>
                      )}
                      {done && <span style={{marginLeft:"auto",fontSize:"12px",color:"#2D7D46"}}>✓</span>}
                    </div>
                  );
                })}

                {mintPhase === "error" && (
                  <div style={{background:"#FDF0F0",border:"1px solid #E5C0C0",borderRadius:"12px",padding:"14px",marginTop:"20px",fontSize:"13px",color:"#C0392B",lineHeight:1.5}}>
                    {mintError || "Unknown error. Please try again."}
                  </div>
                )}

                {txHash && (
                  <div style={{marginTop:"16px",fontSize:"13px",fontFamily:"'JetBrains Mono',monospace",color:"#8A6B4E",wordBreak:"break-all"}}>
                    Tx: <a href={`https://etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{color:"#C87A2E"}}>{txHash.slice(0,20)}…</a>
                  </div>
                )}

                {mintPhase === "error" && (
                  <button style={{...btnOutline, marginTop:"24px"}} onClick={() => { setMintPhase("idle"); setStep(4); }}>
                    ← Go back and retry
                  </button>
                )}
              </>
            ) : (
              /* ── SUCCESS ── */
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:"64px",marginBottom:"16px"}}>🐾</div>
                <h2 style={{fontFamily:"'Fraunces',serif",fontWeight:700,fontSize:"32px",letterSpacing:"-0.02em",margin:"0 0 10px",color:"#3D2817"}}>
                  {form.name} is on-chain!
                </h2>
                <p style={{color:"#5C3E25",fontSize:"16px",margin:"0 0 28px",lineHeight:1.6}}>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"14px",color:"#A35E1B"}}>{ens}</span> is now registered to your wallet and resolves to the IPFS profile.
                </p>

                {profileCid && (
                  <div style={{background:"#F5E6D0",borderRadius:"14px",padding:"16px",marginBottom:"20px"}}>
                    <div style={{fontSize:"12px",fontFamily:"'JetBrains Mono',monospace",color:"#8A6B4E",marginBottom:"6px"}}>IPFS profile</div>
                    <a href={`https://gateway.pinata.cloud/ipfs/${profileCid}`} target="_blank" rel="noopener noreferrer"
                      style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"13px",color:"#A35E1B",wordBreak:"break-all"}}>
                      ipfs://{profileCid}
                    </a>
                  </div>
                )}

                {txHash && (
                  <div style={{marginBottom:"24px"}}>
                    <a href={`https://etherscan.io/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                      style={{fontSize:"13px",fontFamily:"'JetBrains Mono',monospace",color:"#C87A2E"}}>
                      View transaction on Etherscan ↗
                    </a>
                  </div>
                )}

                <div style={{background:"#FFFDF8",border:"1px solid #E5D3B6",borderRadius:"16px",padding:"24px",marginBottom:"24px"}}>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"11px",textTransform:"uppercase",letterSpacing:".1em",color:"#8A6B4E",marginBottom:"14px"}}>Collar QR Code</div>
                  <div style={{display:"inline-block",background:"#fff",borderRadius:"10px",padding:"10px",border:"1px solid #E5D3B6",marginBottom:"14px"}}>
                    <div ref={qrRef} />
                  </div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:"11px",color:"#A35E1B",marginBottom:"16px",wordBreak:"break-all"}}>
                    https://{subdomain}.{namespace}.link
                  </div>
                  <button
                    style={{display:"inline-flex",alignItems:"center",gap:"8px",padding:"11px 20px",background:"#3D2817",color:"#FFFDF8",borderRadius:"10px",fontWeight:600,fontSize:"14px",border:"none",cursor:"pointer",fontFamily:"inherit"}}
                    onClick={() => {
                      const canvas = qrRef.current?.querySelector("canvas");
                      if (!canvas) return;
                      const link = document.createElement("a");
                      link.download = `${form.name.replace(/\s+/g, "-").toLowerCase()}-petid-qr.png`;
                      link.href = (canvas as HTMLCanvasElement).toDataURL("image/png");
                      link.click();
                    }}
                  >
                    ⬇ Download QR Code
                  </button>
                </div>

                <Link href="/" style={{...btnPrimary, textDecoration:"none", display:"inline-flex"}}>
                  Back to PetID
                </Link>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
