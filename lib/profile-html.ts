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
  ownerWallet?: string;
  templateId?: string;
}

function row(label: string, value: string | undefined | boolean) {
  if (!value && value !== false) return "";
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  return `<div class="row"><span class="label">${label}</span><span class="val">${display}</span></div>`;
}

export function generateProfileHtml(p: PetProfile): string {
  const photoBlock = p.photoUrl
    ? `<img src="${p.photoUrl}" alt="${p.name}" class="photo" />`
    : `<div class="photo-placeholder"><svg width="64" height="64" viewBox="0 0 40 40" fill="none"><ellipse cx="20" cy="26" rx="9" ry="8" fill="#C87A2E"/><ellipse cx="9" cy="16" rx="4" ry="5" fill="#C87A2E"/><ellipse cx="31" cy="16" rx="4" ry="5" fill="#C87A2E"/><ellipse cx="15" cy="8" rx="3.2" ry="4" fill="#C87A2E"/><ellipse cx="25" cy="8" rx="3.2" ry="4" fill="#C87A2E"/></svg></div>`;

  const sexLabel = p.sex === "male" ? "Male" : p.sex === "female" ? "Female" : "";
  const profileUrl = `https://${p.ens}.link`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${p.name} — PetID</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;background:#FBF5EC;color:#3D2817;min-height:100vh;-webkit-font-smoothing:antialiased;}
.page{max-width:480px;margin:0 auto;padding:24px 16px 48px;}
.header{text-align:center;padding:32px 0 24px;}
.logo{display:inline-flex;align-items:center;gap:8px;font-family:'Fraunces',serif;font-weight:700;font-size:18px;color:#3D2817;}
.logo-mark{width:30px;height:30px;border-radius:9px;background:#C87A2E;display:grid;place-items:center;}
.card{background:#FFFDF8;border:1px solid #E5D3B6;border-radius:24px;padding:28px;margin-bottom:16px;box-shadow:0 2px 12px rgba(61,40,23,.06);}
.photo{width:100%;max-height:320px;object-fit:cover;border-radius:16px;border:1px solid #E5D3B6;display:block;}
.photo-placeholder{width:100%;height:200px;background:#F5E6D0;border-radius:16px;border:1px dashed #E5D3B6;display:flex;align-items:center;justify-content:center;opacity:.6;}
.pet-name{font-family:'Fraunces',serif;font-weight:700;font-size:40px;letter-spacing:-0.02em;line-height:1;margin:16px 0 4px;}
.ens{font-family:'JetBrains Mono',monospace;font-size:13px;color:#C87A2E;margin-bottom:16px;}
.bio{font-size:15px;line-height:1.6;color:#5C3E25;}
.section-title{font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#8A6B4E;margin-bottom:12px;font-weight:500;}
.row{display:flex;justify-content:space-between;align-items:baseline;padding:8px 0;border-top:1px dashed #E5D3B6;font-size:14px;}
.row:first-of-type{border-top:none;}
.label{color:#8A6B4E;}
.val{color:#3D2817;font-weight:600;text-align:right;max-width:60%;}
.found-card{background:#3D2817;color:#FBF5EC;border-radius:24px;padding:28px;margin-bottom:16px;text-align:center;}
.found-title{font-family:'Fraunces',serif;font-size:28px;font-weight:700;margin-bottom:6px;color:#FFFDF8;}
.found-sub{font-size:14px;color:rgba(251,245,236,.7);margin-bottom:20px;}
.found-btn{display:inline-flex;align-items:center;gap:8px;padding:14px 24px;background:#C87A2E;color:#FFFDF8;border-radius:12px;font-weight:600;font-size:15px;text-decoration:none;border:none;cursor:pointer;width:100%;justify-content:center;font-family:inherit;}
.found-btn:hover{background:#A35E1B;}
.contact-row{display:flex;flex-direction:column;gap:8px;margin-top:16px;font-size:14px;}
.contact-row a{color:#E8A962;text-decoration:none;}
.foot{text-align:center;padding-top:24px;font-family:'JetBrains Mono',monospace;font-size:11px;color:#8A6B4E;}
.foot a{color:#C87A2E;}
.qr-card{background:#FFFDF8;border:1px solid #E5D3B6;border-radius:24px;padding:28px;margin-bottom:16px;box-shadow:0 2px 12px rgba(61,40,23,.06);text-align:center;}
.qr-wrap{display:inline-block;background:#fff;border-radius:12px;padding:12px;margin-bottom:14px;border:1px solid #E5D3B6;}
.qr-label{font-family:'JetBrains Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#8A6B4E;margin-bottom:14px;}
.qr-url{font-family:'JetBrains Mono',monospace;font-size:11px;color:#A35E1B;word-break:break-all;margin-bottom:16px;}
.qr-btn{display:inline-flex;align-items:center;gap:8px;padding:11px 20px;background:#3D2817;color:#FFFDF8;border-radius:10px;font-weight:600;font-size:14px;text-decoration:none;border:none;cursor:pointer;font-family:inherit;}
.qr-btn:hover{background:#C87A2E;}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">
      <div class="logo-mark"><svg width="18" height="18" viewBox="0 0 40 40" fill="none"><ellipse cx="20" cy="26" rx="9" ry="8" fill="#FFFDF8"/><ellipse cx="9" cy="16" rx="4" ry="5" fill="#FFFDF8"/><ellipse cx="31" cy="16" rx="4" ry="5" fill="#FFFDF8"/><ellipse cx="15" cy="8" rx="3.2" ry="4" fill="#FFFDF8"/><ellipse cx="25" cy="8" rx="3.2" ry="4" fill="#FFFDF8"/></svg></div>
      PetID
    </div>
  </div>

  <div class="found-card">
    <div class="found-title">Found ${p.name}?</div>
    <div class="found-sub">Please help them get home safely</div>
    ${p.ownerPhone ? `<a href="tel:${p.ownerPhone}" class="found-btn">📞 Call ${p.ownerName}</a>` : ""}
    <div class="contact-row">
      ${p.ownerEmail ? `<a href="mailto:${p.ownerEmail}">✉ ${p.ownerEmail}</a>` : ""}
      ${p.ownerPhone ? `<span style="color:rgba(251,245,236,.5)">${p.ownerPhone}</span>` : ""}
    </div>
  </div>

  <div class="card">
    ${photoBlock}
    <div class="pet-name">${p.name}</div>
    <div class="ens">${p.ens}</div>
    ${p.bio ? `<p class="bio">${p.bio}</p>` : ""}
  </div>

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
    ${p.emergencyNotes ? `<div style="margin-top:12px;padding-top:12px;border-top:1px dashed #E5D3B6;font-size:14px;color:#5C3E25;line-height:1.5;"><span style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#8A6B4E;font-family:'JetBrains Mono',monospace;">Emergency notes</span><br/><br/>${p.emergencyNotes}</div>` : ""}
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
    ${row("Email", p.ownerEmail)}
    ${p.ownerWallet ? `${row("Wallet", p.ownerWallet.slice(0, 8) + "…" + p.ownerWallet.slice(-6))}` : ""}
  </div>

  <div class="qr-card">
    <div class="qr-label">Collar QR Code</div>
    <div class="qr-wrap"><div id="qrcode"></div></div>
    <div class="qr-url">${profileUrl}</div>
    <button class="qr-btn" onclick="downloadQR()">⬇ Download QR Code</button>
  </div>

  <div class="foot">
    Identity stored on <a href="https://petid.eth.link" target="_blank">petid.eth</a> · Powered by ENS + IPFS
  </div>
</div>
<script>
  var qr = new QRCode(document.getElementById("qrcode"), {
    text: "${profileUrl}",
    width: 180,
    height: 180,
    colorDark: "#3D2817",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
  function downloadQR() {
    var canvas = document.querySelector("#qrcode canvas");
    if (!canvas) { setTimeout(downloadQR, 200); return; }
    var link = document.createElement("a");
    link.download = "${p.name.replace(/\s+/g, "-").toLowerCase()}-petid-qr.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }
</script>
</body>
</html>`;
}
