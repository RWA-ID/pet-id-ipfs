export interface PetProfile {
  name: string;
  ens: string;
  photoUrl?: string;
  breed?: string;
  color?: string;
  ageYears?: string;
  sex?: string;
  microchip?: string;
  neutered?: boolean;
  weight?: string;
  vetName?: string;
  vaccinated?: boolean;
  favFood?: string;
  favToy?: string;
  bio?: string;
  emergencyNotes?: string;
  ownerName: string;
  ownerPhone?: string;
  ownerEmail?: string;
  ownerTelegram?: string;
  ownerWhatsapp?: string;
  ownerWallet?: string;
  templateId?: string;
}

// ─── themes ──────────────────────────────────────────────────────────────────

interface Theme {
  fontsHref: string;
  display: string;
  body: string;
  mono: string;
  bg: string;
  surface: string;
  border: string;
  borderStyle: "solid" | "dashed";
  text: string;
  bodyText: string;
  muted: string;
  accent: string;
  accentDark: string;
  accentSoft: string;
  foundBg: string;
  foundTitle: string;
  foundSub: string;
  btnBg: string;
  btnText: string;
  alertBg: string;
  alertBorder: string;
  alertText: string;
  radius: string;
  radiusSm: string;
  shadow: string;
  qrDark: string;
  nameExtra: string;
  photoRound: boolean;
}

const THEMES: Record<string, Theme> = {
  "dog-rustic": {
    fontsHref:
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
    display: "'Fraunces',serif",
    body: "'Plus Jakarta Sans',system-ui,sans-serif",
    mono: "'JetBrains Mono',monospace",
    bg: "#FBF5EC",
    surface: "#FFFDF8",
    border: "#E5D3B6",
    borderStyle: "dashed",
    text: "#3D2817",
    bodyText: "#5C3E25",
    muted: "#8A6B4E",
    accent: "#C87A2E",
    accentDark: "#A35E1B",
    accentSoft: "#F5E6D0",
    foundBg: "#3D2817",
    foundTitle: "#FFFDF8",
    foundSub: "rgba(251,245,236,.7)",
    btnBg: "#C87A2E",
    btnText: "#FFFDF8",
    alertBg: "#FEF3E5",
    alertBorder: "#E8A962",
    alertText: "#7A5020",
    radius: "24px",
    radiusSm: "12px",
    shadow: "0 2px 12px rgba(61,40,23,.06)",
    qrDark: "#3D2817",
    nameExtra: "",
    photoRound: false,
  },
  "dog-modern": {
    fontsHref:
      "https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
    display: "'Archivo',system-ui,sans-serif",
    body: "'Inter',system-ui,sans-serif",
    mono: "'JetBrains Mono',monospace",
    bg: "#F4F4F2",
    surface: "#FFFFFF",
    border: "#E4E4E1",
    borderStyle: "solid",
    text: "#111111",
    bodyText: "#3F3F3C",
    muted: "#8A8A85",
    accent: "#111111",
    accentDark: "#000000",
    accentSoft: "#ECECEA",
    foundBg: "#111111",
    foundTitle: "#FFFFFF",
    foundSub: "rgba(255,255,255,.6)",
    btnBg: "#F59E0B",
    btnText: "#111111",
    alertBg: "#FFF3CD",
    alertBorder: "#FFC107",
    alertText: "#6B5310",
    radius: "14px",
    radiusSm: "8px",
    shadow: "0 1px 6px rgba(0,0,0,.06)",
    qrDark: "#111111",
    nameExtra: "text-transform:uppercase;letter-spacing:-0.03em;font-weight:900;",
    photoRound: false,
  },
  "cat-neon": {
    fontsHref:
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@400;500&display=swap",
    display: "'Space Grotesk',system-ui,sans-serif",
    body: "'JetBrains Mono',monospace",
    mono: "'JetBrains Mono',monospace",
    bg: "#0A0A0A",
    surface: "#111111",
    border: "#232323",
    borderStyle: "solid",
    text: "#E0E0E0",
    bodyText: "#AAAAAA",
    muted: "#666666",
    accent: "#00FF99",
    accentDark: "#00CC7A",
    accentSoft: "#0F1A14",
    foundBg: "#0F1A14",
    foundTitle: "#00FF99",
    foundSub: "rgba(224,224,224,.55)",
    btnBg: "#00FF99",
    btnText: "#0A0A0A",
    alertBg: "#1A0A00",
    alertBorder: "#FF6600",
    alertText: "#FF9940",
    radius: "12px",
    radiusSm: "8px",
    shadow: "0 0 24px rgba(0,255,153,.06)",
    qrDark: "#0A0A0A",
    nameExtra: "text-shadow:0 0 24px rgba(0,255,153,.5);",
    photoRound: true,
  },
  "cat-soft": {
    fontsHref:
      "https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700&family=Nunito:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
    display: "'Baloo 2',system-ui,sans-serif",
    body: "'Nunito',system-ui,sans-serif",
    mono: "'JetBrains Mono',monospace",
    bg: "#FDF6F9",
    surface: "#FFFFFF",
    border: "#F3D9E7",
    borderStyle: "solid",
    text: "#4A3040",
    bodyText: "#7A5060",
    muted: "#B08AA0",
    accent: "#E890C0",
    accentDark: "#C86AA6",
    accentSoft: "#FBEAF3",
    foundBg: "linear-gradient(135deg,#F9C6D9,#C9B3F0)",
    foundTitle: "#4A3040",
    foundSub: "rgba(74,48,64,.65)",
    btnBg: "#C86AA6",
    btnText: "#FFFFFF",
    alertBg: "#FFF8E1",
    alertBorder: "#FFCC80",
    alertText: "#7A5020",
    radius: "22px",
    radiusSm: "14px",
    shadow: "0 2px 12px rgba(200,120,180,.10)",
    qrDark: "#4A3040",
    nameExtra: "",
    photoRound: true,
  },
};

const DEFAULT_TEMPLATE = "dog-rustic";

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(label: string, value: string | undefined | boolean) {
  if (!value && value !== false) return "";
  const display =
    typeof value === "boolean" ? (value ? "Yes" : "No") : esc(value);
  return `<div class="row"><span class="label">${label}</span><span class="val">${display}</span></div>`;
}

// ─── generator ───────────────────────────────────────────────────────────────

export function generateProfileHtml(p: PetProfile): string {
  const t = THEMES[p.templateId ?? DEFAULT_TEMPLATE] ?? THEMES[DEFAULT_TEMPLATE];
  const name = esc(p.name);
  const ens = esc(p.ens);

  const photoBlock = p.photoUrl
    ? `<img src="${esc(p.photoUrl)}" alt="${name}" class="photo" />`
    : `<div class="photo-placeholder"><svg width="64" height="64" viewBox="0 0 40 40" fill="${t.accent}"><ellipse cx="20" cy="26" rx="9" ry="8"/><ellipse cx="9" cy="16" rx="4" ry="5"/><ellipse cx="31" cy="16" rx="4" ry="5"/><ellipse cx="15" cy="8" rx="3.2" ry="4"/><ellipse cx="25" cy="8" rx="3.2" ry="4"/></svg></div>`;

  const sexLabel = p.sex === "male" ? "Male" : p.sex === "female" ? "Female" : "";
  const profileUrl = `https://${p.ens}.link`;

  // Contact actions — phone / WhatsApp / Telegram / email
  const telHref = p.ownerPhone ? `tel:${p.ownerPhone.replace(/[^+\d]/g, "")}` : "";
  const waDigits = p.ownerWhatsapp ? p.ownerWhatsapp.replace(/\D/g, "") : "";
  const tgHandle = p.ownerTelegram ? p.ownerTelegram.trim().replace(/^@/, "") : "";
  const actions = [
    telHref
      ? `<a href="${telHref}" class="found-btn">📞 Call ${esc(p.ownerName)}</a>`
      : "",
    waDigits
      ? `<a href="https://wa.me/${waDigits}" target="_blank" rel="noopener" class="found-btn wa">💬 WhatsApp</a>`
      : "",
    tgHandle
      ? `<a href="https://t.me/${esc(tgHandle)}" target="_blank" rel="noopener" class="found-btn tg">✈️ Telegram</a>`
      : "",
    p.ownerEmail
      ? `<a href="mailto:${esc(p.ownerEmail)}" class="found-btn mail">✉️ Email</a>`
      : "",
  ]
    .filter(Boolean)
    .join("\n      ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${name} — PetID</title>
<meta name="description" content="${name} · ${ens} · permanent pet identity on ENS + IPFS" />
${p.photoUrl ? `<meta property="og:image" content="${esc(p.photoUrl)}" />` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="${t.fontsHref}" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:${t.body};background:${t.bg};color:${t.text};min-height:100vh;-webkit-font-smoothing:antialiased;}
.page{max-width:520px;margin:0 auto;padding:24px 16px 48px;}
.header{text-align:center;padding:24px 0 20px;}
.logo{display:inline-flex;align-items:center;gap:8px;font-family:${t.display};font-weight:700;font-size:18px;color:${t.text};}
.logo-mark{width:30px;height:30px;border-radius:9px;background:${t.accent};display:grid;place-items:center;}
.card{background:${t.surface};border:1px solid ${t.border};border-radius:${t.radius};padding:26px;margin-bottom:16px;box-shadow:${t.shadow};}
.photo{width:100%;max-height:340px;object-fit:cover;border-radius:${t.photoRound ? "50% / 42%" : t.radiusSm};border:1px solid ${t.border};display:block;}
.photo-placeholder{width:100%;height:200px;background:${t.accentSoft};border-radius:${t.radiusSm};border:1px dashed ${t.border};display:flex;align-items:center;justify-content:center;opacity:.6;}
.pet-name{font-family:${t.display};font-weight:700;font-size:40px;letter-spacing:-0.02em;line-height:1.1;margin:16px 0 4px;${t.nameExtra}}
.ens{font-family:${t.mono};font-size:13px;color:${t.accentDark === "#000000" ? "#F59E0B" : t.accentDark};margin-bottom:14px;word-break:break-all;}
.bio{font-size:15px;line-height:1.6;color:${t.bodyText};}
.section-title{font-family:${t.mono};font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:${t.muted};margin-bottom:12px;font-weight:500;}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:8px 0;border-top:1px ${t.borderStyle} ${t.border};font-size:14px;}
.row:first-of-type{border-top:none;}
.label{color:${t.muted};flex-shrink:0;}
.val{color:${t.text};font-weight:600;text-align:right;overflow-wrap:anywhere;}
.found-card{background:${t.foundBg};border-radius:${t.radius};padding:26px;margin-bottom:16px;text-align:center;${p.templateId === "cat-neon" ? `border:1px solid ${t.accent}55;` : ""}}
.found-title{font-family:${t.display};font-size:28px;font-weight:700;margin-bottom:4px;color:${t.foundTitle};}
.found-sub{font-size:14px;color:${t.foundSub};margin-bottom:18px;}
.found-actions{display:grid;gap:10px;}
.found-btn{display:inline-flex;align-items:center;gap:8px;padding:13px 20px;background:${t.btnBg};color:${t.btnText};border-radius:${t.radiusSm};font-weight:700;font-size:15px;text-decoration:none;border:none;cursor:pointer;width:100%;justify-content:center;font-family:${t.body};}
.found-btn:hover{filter:brightness(.92);}
.found-btn.wa{background:#25D366;color:#062E17;}
.found-btn.tg{background:#229ED9;color:#FFFFFF;}
.found-btn.mail{background:transparent;border:1.5px solid ${t.foundTitle}66;color:${t.foundTitle};font-weight:600;}
.alert{background:${t.alertBg};border:1px solid ${t.alertBorder};border-radius:${t.radiusSm};padding:14px 16px;margin-top:14px;font-size:14px;color:${t.alertText};line-height:1.55;text-align:left;}
.alert b{display:block;font-family:${t.mono};font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;}
.foot{text-align:center;padding-top:24px;font-family:${t.mono};font-size:11px;color:${t.muted};}
.foot a{color:${t.accent === "#111111" ? "#F59E0B" : t.accent};}
.qr-card{background:${t.surface};border:1px solid ${t.border};border-radius:${t.radius};padding:26px;margin-bottom:16px;box-shadow:${t.shadow};text-align:center;}
.qr-wrap{display:inline-block;background:#fff;border-radius:12px;padding:12px;margin-bottom:14px;border:1px solid ${t.border};}
.qr-label{font-family:${t.mono};font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:${t.muted};margin-bottom:14px;}
.qr-url{font-family:${t.mono};font-size:11px;color:${t.accentDark === "#000000" ? "#B45309" : t.accentDark};word-break:break-all;margin-bottom:16px;}
.qr-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 20px;background:${t.accent};color:${t.btnText === "#111111" && t.accent === "#111111" ? "#FFFFFF" : t.accent === "#00FF99" ? "#0A0A0A" : "#FFFFFF"};border-radius:${t.radiusSm};font-weight:600;font-size:14px;text-decoration:none;border:none;cursor:pointer;font-family:${t.body};}
.qr-btn:hover{filter:brightness(.9);}

/* ── desktop ── */
@media (min-width:900px){
  .page{max-width:1060px;padding:32px 32px 64px;}
  .header{text-align:left;padding:16px 0 24px;}
  .found-card{display:flex;align-items:center;justify-content:space-between;gap:28px;text-align:left;padding:28px 32px;}
  .found-info{flex:1;min-width:0;}
  .found-sub{margin-bottom:0;}
  .found-actions{grid-template-columns:repeat(2,minmax(170px,1fr));flex-shrink:0;}
  .layout{display:grid;grid-template-columns:400px minmax(0,1fr);gap:20px;align-items:start;}
  .col-left{position:sticky;top:24px;}
  .pet-name{font-size:48px;}
  .photo{max-height:420px;}
}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">
      <div class="logo-mark"><svg width="18" height="18" viewBox="0 0 40 40" fill="${t.btnText === "#0A0A0A" ? "#0A0A0A" : "#FFFDF8"}"><ellipse cx="20" cy="26" rx="9" ry="8"/><ellipse cx="9" cy="16" rx="4" ry="5"/><ellipse cx="31" cy="16" rx="4" ry="5"/><ellipse cx="15" cy="8" rx="3.2" ry="4"/><ellipse cx="25" cy="8" rx="3.2" ry="4"/></svg></div>
      PetID
    </div>
  </div>

  <div class="found-card">
    <div class="found-info">
      <div class="found-title">Found ${name}?</div>
      <div class="found-sub">Please help them get home safely</div>
    </div>
    <div class="found-actions">
      ${actions || `<span style="color:${t.foundSub};font-size:14px;">Contact details on this page</span>`}
    </div>
  </div>

  <div class="layout">
    <div class="col-left">
      <div class="card">
        ${photoBlock}
        <div class="pet-name">${name}</div>
        <div class="ens">${ens}</div>
        ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ""}
      </div>
    </div>

    <div class="col-right">
      <div class="card">
        <div class="section-title">Identity</div>
        ${row("Breed", p.breed)}
        ${row("Color / Markings", p.color)}
        ${row("Age", p.ageYears ? `${p.ageYears} years` : undefined)}
        ${row("Sex", sexLabel || undefined)}
        ${row("Microchip / Tag #", p.microchip)}
      </div>

      <div class="card">
        <div class="section-title">Health</div>
        ${row("Neutered / Spayed", p.neutered !== undefined ? p.neutered : undefined)}
        ${row("Weight", p.weight ? `${p.weight} lbs` : undefined)}
        ${row("Vaccinated", p.vaccinated !== undefined ? p.vaccinated : undefined)}
        ${row("Vet / Clinic", p.vetName)}
        ${p.emergencyNotes ? `<div class="alert"><b>⚠ Emergency notes</b>${esc(p.emergencyNotes)}</div>` : ""}
      </div>

      ${p.favFood || p.favToy ? `
      <div class="card">
        <div class="section-title">Personality</div>
        ${row("Favorite food", p.favFood)}
        ${row("Favorite toy", p.favToy)}
      </div>` : ""}

      <div class="card">
        <div class="section-title">Owner</div>
        ${row("Name", p.ownerName)}
        ${row("Phone", p.ownerPhone)}
        ${row("WhatsApp", p.ownerWhatsapp)}
        ${row("Telegram", tgHandle ? `@${tgHandle}` : undefined)}
        ${row("Email", p.ownerEmail)}
        ${p.ownerWallet ? `${row("Wallet", p.ownerWallet.slice(0, 8) + "…" + p.ownerWallet.slice(-6))}` : ""}
      </div>

      <div class="qr-card">
        <div class="qr-label">Collar QR Code</div>
        <div class="qr-wrap"><div id="qrcode"></div></div>
        <div class="qr-url">${esc(profileUrl)}</div>
        <button class="qr-btn" onclick="downloadQR()">⬇ Download QR Code</button>
      </div>
    </div>
  </div>

  <div class="foot">
    Identity stored on <a href="https://petid.eth.link" target="_blank">petid.eth</a> · Powered by ENS + IPFS
  </div>
</div>
<script>
  var qr = new QRCode(document.getElementById("qrcode"), {
    text: ${JSON.stringify(profileUrl)},
    width: 180,
    height: 180,
    colorDark: "${t.qrDark}",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
  function downloadQR() {
    var canvas = document.querySelector("#qrcode canvas");
    if (!canvas) { setTimeout(downloadQR, 200); return; }
    var link = document.createElement("a");
    link.download = ${JSON.stringify(p.name.replace(/\s+/g, "-").toLowerCase() + "-petid-qr.png")};
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
</script>
</body>
</html>`;
}
