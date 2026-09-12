import type { Env } from "./env";
import type { OrderRow } from "./db";
import { short } from "./util";

/** Returns an error string instead of throwing: a failed email must never fail an order. */
export async function sendEmail(
  env: Env, to: string, subject: string, text: string, html?: string,
): Promise<string | null> {
  if (!env.RESEND_API_KEY) return "RESEND_API_KEY not set";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      // Always send the text part as well: some clients prefer it, and a text
      // alternative keeps the message out of spam folders.
      body: JSON.stringify({ from: env.NOTIFY_FROM, to: [to], subject, text, ...(html ? { html } : {}) }),
    });
    if (res.ok) return null;
    const detail = `resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
    console.error(detail);
    return detail;
  } catch (e) {
    console.error("resend threw", short(e));
    return `resend threw: ${short(e)}`;
  }
}

export const alertAdmin = (env: Env, subject: string, text: string) =>
  sendEmail(env, env.NOTIFY_EMAIL, `[petid-pay] ${subject}`, text);

// ─── customer emails ─────────────────────────────────────────────────────────
//
// Built from the designed template in the "PetID ENS Flyer Campaign" handoff,
// with four changes the design couldn't know about:
//
//   1. A card buyer does NOT hold the name yet — the registrar holds it until
//      they claim it. The design said "held in your wallet" and offered no way
//      to claim, which is the single most important thing this email has to say.
//   2. There is no hosted QR image. The QR is drawn in the browser on the pet's
//      own page, which a mail client cannot render, so the collar-tag section
//      links there instead of embedding an image that would never load.
//   3. The template's "dashboard" is /account/, and the profile URL is .limo.
//   4. The footer's postal address, unsubscribe and preferences links were
//      placeholders for a company that doesn't exist. This is a transactional
//      receipt from Only Buy Bitcoin LLC; it names the operator and links the
//      real Terms and Privacy pages instead of inventing an address.
//
// Table layout, inline styles, no web fonts, images only from our own gateway.

const nameOf = (o: OrderRow) => `${o.label}.${o.parent}`;
const siteUrl = (o: OrderRow) => `https://${nameOf(o)}.limo`;
/** Short, readable order number: the first block of the UUID. */
const orderNo = (o: OrderRow) => `#PET-${o.id.split("-")[0].toUpperCase()}`;
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Everything user-supplied is escaped: pet names and account names are input. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The buyer's Google account name, first word only. Never fails an email. */
async function firstName(env: Env, o: OrderRow): Promise<string | null> {
  try {
    const row = await env.DB.prepare("SELECT name FROM users WHERE sub = ?").bind(o.user_sub).first<{ name: string | null }>();
    const first = (row?.name ?? "").trim().split(/\s+/)[0];
    return first && first.length <= 24 ? first : null;
  } catch {
    return null;
  }
}

const C = {
  page: "#F2E7D6", card: "#FFFDF8", ink: "#3D2817", body: "#5C3E25", muted: "#8A6B4E",
  amber: "#C87A2E", amberSoft: "#E8A962", amberInk: "#A35E1B", line: "#E5D3B6",
  sand: "#F5E6D0", sandDeep: "#EFDCBE", cream: "#FBF5EC", dark: "#3D2817", darkText: "#D9C3A5",
};
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "Arial,Helvetica,sans-serif";
const MONO = "'Courier New',Courier,monospace";

const button = (href: string, label: string, bg = C.amber, fg = "#FFFDF8") =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
     <td align="center" bgcolor="${bg}" style="border-radius:12px;">
       <a href="${href}" style="display:block;padding:15px 34px;font-family:${SANS};font-size:16px;font-weight:bold;color:${fg};text-decoration:none;border-radius:12px;mso-line-height-rule:exactly;line-height:21px;">${label}</a>
     </td></tr></table>`;

function shell(env: Env, preheader: string, sections: string): string {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  @media only screen and (max-width:620px){
    .sp{width:100% !important;max-width:100% !important;}
    .pad{padding-left:24px !important;padding-right:24px !important;}
    .h1{font-size:30px !important;line-height:36px !important;}
  }
</style></head>
<body style="margin:0;padding:0;background-color:${C.page};">
<span style="display:none;font-size:1px;color:${C.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.page};">
<tr><td align="center" style="padding:28px 12px 40px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="sp" style="width:600px;max-width:600px;">
  <tr><td align="center" style="padding:4px 0 22px 0;font-family:${SERIF};font-size:22px;font-weight:bold;color:${C.body};letter-spacing:0.5px;">PetID</td></tr>
  ${sections}
  <tr><td align="center" style="padding:26px 24px 0 24px;font-family:${SANS};font-size:12px;line-height:20px;color:${C.muted};mso-line-height-rule:exactly;">
    You're receiving this because you bought a PetID.<br>
    PetID is operated by Only Buy Bitcoin LLC · <a href="mailto:${env.NOTIFY_EMAIL}" style="color:${C.muted};text-decoration:underline;">${env.NOTIFY_EMAIL}</a><br>
    <a href="${env.SITE_URL}/terms/" style="color:${C.muted};text-decoration:underline;">Terms</a>
    &nbsp;·&nbsp;
    <a href="${env.SITE_URL}/privacy/" style="color:${C.muted};text-decoration:underline;">Privacy</a>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

const helpStrip = (rounded: boolean) =>
  `<tr><td style="background-color:${C.sandDeep};border:1px solid ${C.line};border-top:0;${rounded ? "border-radius:0 0 20px 20px;" : ""}">
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
       <tr><td align="center" class="pad" style="padding:22px 44px;font-family:${SANS};font-size:14px;line-height:22px;color:${C.body};mso-line-height-rule:exactly;">
         Need a hand? Just reply to this email — a person reads it.
       </td></tr></table>
   </td></tr>`;

export async function emailMinted(env: Env, o: OrderRow) {
  const pet = o.pet_name || o.label;
  const url = siteUrl(o);
  const account = `${env.SITE_URL}/account/`;
  // Rendered on demand by this worker — see src/pay/qr.ts.
  const qrUrl = `${env.PUBLIC_URL}/qr/${o.id}.png`;
  const hi = await firstName(env, o);

  const photo = o.photo_url
    ? `<tr><td align="center" style="padding:32px 44px 0 44px;">
         <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
           <tr><td align="center" style="background-color:${C.sand};border:1px solid ${C.line};border-radius:16px;padding:10px;">
             <img src="${esc(o.photo_url)}" width="470" alt="${esc(pet)}" style="display:block;width:100%;max-width:470px;height:auto;border:0;outline:none;text-decoration:none;border-radius:10px;background-color:${C.sandDeep};">
           </td></tr></table>
       </td></tr>`
    : "";

  const sections = `
  <tr><td style="background-color:${C.card};border:1px solid ${C.line};border-radius:20px 20px 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center" class="pad" style="padding:44px 44px 0 44px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background-color:${C.sandDeep};border-radius:999px;padding:7px 16px;font-family:${SANS};font-size:12px;font-weight:bold;color:${C.amberInk};letter-spacing:1.2px;text-transform:uppercase;mso-line-height-rule:exactly;line-height:16px;">Order confirmed</td>
        </tr></table>
      </td></tr>
      <tr><td align="center" class="pad h1" style="padding:22px 44px 0 44px;font-family:${SERIF};font-size:38px;line-height:44px;color:${C.ink};mso-line-height-rule:exactly;">
        ${esc(pet)} has a home<br>on the internet.
      </td></tr>
      <tr><td align="center" class="pad" style="padding:16px 52px 0 52px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.body};mso-line-height-rule:exactly;">
        ${hi ? `Thank you, ${esc(hi)}. ` : "Thank you! "}Their page is live and their name is registered on Ethereum. No subscription, nothing to renew — this one is theirs for good.
      </td></tr>
      ${photo}
      <tr><td align="center" class="pad" style="padding:26px 44px 0 44px;font-family:${MONO};font-size:19px;font-weight:bold;color:${C.amberInk};letter-spacing:0.3px;mso-line-height-rule:exactly;line-height:24px;">${nameOf(o)}</td></tr>
      <tr><td align="center" class="pad" style="padding:8px 44px 0 44px;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};mso-line-height-rule:exactly;">
        Also reachable at ${nameOf(o)}.link
      </td></tr>
      <tr><td align="center" style="padding:26px 44px 44px 44px;">${button(url, `Visit ${esc(pet)}'s website`)}</td></tr>
    </table>
  </td></tr>

  <!-- Step 2: the claim. The buyer does not hold the name yet; this is the email's job. -->
  <tr><td style="background-color:${C.sand};border:1px solid ${C.line};border-top:0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center" class="pad" style="padding:38px 44px 0 44px;font-family:${SANS};font-size:12px;font-weight:bold;color:${C.amberInk};letter-spacing:1.4px;text-transform:uppercase;mso-line-height-rule:exactly;line-height:16px;">Step 2 — the keys</td></tr>
      <tr><td align="center" class="pad" style="padding:14px 44px 0 44px;font-family:${SERIF};font-size:27px;line-height:34px;color:${C.ink};mso-line-height-rule:exactly;">
        We're holding the name<br>safely for you.
      </td></tr>
      <tr><td align="center" class="pad" style="padding:16px 52px 0 52px;font-family:${SANS};font-size:15px;line-height:24px;color:${C.body};mso-line-height-rule:exactly;">
        You didn't need a crypto wallet to buy, so <strong style="color:${C.ink};">${nameOf(o)}</strong> is looked after for you until you want it.
        Whenever you're ready, sign in with the same Google account and send it to a wallet — it's free, it takes a minute,
        and from that moment it's permanently yours. Nobody, including us, can take it back.
      </td></tr>
      <tr><td align="center" style="padding:26px 44px 40px 44px;">${button(account, "Claim it to a wallet")}</td></tr>
    </table>
  </td></tr>

  <!-- Step 3: the collar tag. No image: the QR is generated on the pet's own page. -->
  <tr><td style="background-color:${C.dark};border:1px solid ${C.dark};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center" class="pad" style="padding:40px 44px 0 44px;font-family:${SANS};font-size:12px;font-weight:bold;color:${C.amberSoft};letter-spacing:1.4px;text-transform:uppercase;mso-line-height-rule:exactly;line-height:16px;">Step 3 — the collar tag</td></tr>
      <tr><td align="center" class="pad" style="padding:14px 44px 0 44px;font-family:${SERIF};font-size:27px;line-height:34px;color:${C.cream};mso-line-height-rule:exactly;">
        If they ever wander,<br>one scan brings them home.
      </td></tr>
      <tr><td align="center" style="padding:30px 44px 0 44px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="230" style="width:230px;">
          <tr><td align="center" bgcolor="${C.card}" style="background-color:${C.card};border-radius:18px;padding:20px 18px 18px 18px;">
            <div style="font-family:${SERIF};font-size:16px;font-weight:bold;color:${C.ink};line-height:20px;">Scan if lost</div>
            <div style="padding:5px 0 14px 0;font-family:${MONO};font-size:11px;color:${C.muted};line-height:15px;word-break:break-all;">${nameOf(o)}</div>
            <img src="${qrUrl}" width="170" height="170" alt="QR code linking to ${esc(pet)}'s PetID page" style="display:block;width:170px;height:170px;border:1px solid ${C.line};border-radius:8px;background-color:#FFFFFF;">
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" class="pad" style="padding:24px 56px 0 56px;font-family:${SANS};font-size:15px;line-height:24px;color:${C.darkText};mso-line-height-rule:exactly;">
        Save it, print it at any size, and clip it to their collar. Whoever finds them points a phone at it and your
        contact details come straight up. It's on ${esc(pet)}'s page too, any time you need another copy.
      </td></tr>
      <tr><td align="center" style="padding:26px 44px 42px 44px;">${button(qrUrl, "Download the QR tag", C.amberSoft, C.ink)}</td></tr>
    </table>
  </td></tr>

  <tr><td style="background-color:${C.card};border:1px solid ${C.line};border-top:0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td class="pad" style="padding:38px 44px 0 44px;font-family:${SERIF};font-size:21px;line-height:27px;color:${C.ink};mso-line-height-rule:exactly;">What's yours now</td></tr>
      <tr><td class="pad" style="padding:20px 44px 0 44px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${[
            [`${nameOf(o)}`, "a real ENS name, held safely for you until you claim it to a wallet."],
            ["A website on IPFS", "no server to go down, no host to pay. It stays up on its own."],
            ["Your printable QR tag", "on your pet's page, ready whenever you need another copy."],
            ["One payment, done", "no subscription, no renewals, no upsell later."],
          ].map(([b, rest]) => `<tr>
            <td width="30" valign="top" style="width:30px;font-family:${SANS};font-size:16px;color:${C.amber};line-height:24px;">&bull;</td>
            <td valign="top" style="font-family:${SANS};font-size:15px;line-height:24px;color:${C.body};padding-bottom:12px;mso-line-height-rule:exactly;">
              <strong style="color:${C.ink};">${b}</strong> — ${rest}
            </td></tr>`).join("")}
        </table>
      </td></tr>
      <tr><td class="pad" style="padding:32px 44px 0 44px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${C.cream};border:1px solid ${C.line};border-radius:14px;">
          <tr><td style="padding:18px 22px 8px 22px;font-family:${SANS};font-size:12px;font-weight:bold;color:${C.muted};letter-spacing:1.2px;text-transform:uppercase;line-height:16px;">Order summary</td></tr>
          <tr><td style="padding:0 22px 6px 22px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-family:${SANS};font-size:14px;line-height:22px;color:${C.body};">PetID — pet website + collar tag</td>
                <td align="right" style="font-family:${SANS};font-size:14px;line-height:22px;color:${C.ink};font-weight:bold;">${money(o.amount_cents)} paid</td>
              </tr>
              <tr>
                <td style="font-family:${SANS};font-size:14px;line-height:22px;color:${C.body};">Order</td>
                <td align="right" style="font-family:${MONO};font-size:13px;line-height:22px;color:${C.ink};">${orderNo(o)}</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:10px 22px 18px 22px;border-top:1px dashed ${C.line};">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="font-family:${SANS};font-size:14px;line-height:22px;color:${C.body};padding-top:8px;">One-time payment</td>
                <td align="right" style="font-family:${SANS};font-size:15px;line-height:22px;color:${C.ink};font-weight:bold;padding-top:8px;">No subscription</td>
              </tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="pad" style="padding:30px 44px 40px 44px;font-family:${SANS};font-size:15px;line-height:24px;color:${C.body};mso-line-height-rule:exactly;">
        Give ${esc(pet)} a scratch behind the ears from us.<br>
        <span style="color:${C.muted};">— The PetID team</span>
      </td></tr>
    </table>
  </td></tr>
  ${helpStrip(true)}`;

  const text = [
    hi ? `Thank you, ${hi}!` : "Thank you for your order!",
    "",
    `${esc(pet)}'s page is live and ${nameOf(o)} is registered on Ethereum:`,
    url,
    `(the same page also works at https://${nameOf(o)}.link)`,
    "",
    "STEP 2 — THE KEYS",
    `You didn't need a crypto wallet to buy, so we're holding ${nameOf(o)} safely for you.`,
    "Whenever you're ready, sign in with the same Google account and send it to a wallet —",
    "it's free, and from that moment it's permanently yours:",
    `${env.SITE_URL}/account/`,
    "",
    "STEP 3 — THE COLLAR TAG",
    "Save this QR code, print it at any size, and clip it to their collar:",
    qrUrl,
    `(it's on ${pet}'s page too, any time you need another copy)`,
    "",
    `Order ${orderNo(o)} · ${money(o.amount_cents)} · one-time payment, no subscription`,
  ].join("\n");

  return sendEmail(env, o.email, `${pet}'s website is live — ${nameOf(o)}`, text, shell(env,
    `${pet}'s page is live. Here's how to claim the name and print the collar tag.`, sections));
}

export async function emailClaimed(env: Env, o: OrderRow) {
  const pet = o.pet_name || o.label;
  const hi = await firstName(env, o);
  const sections = `
  <tr><td style="background-color:${C.card};border:1px solid ${C.line};border-radius:20px 20px 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center" class="pad h1" style="padding:44px 44px 0 44px;font-family:${SERIF};font-size:34px;line-height:40px;color:${C.ink};mso-line-height-rule:exactly;">
        ${esc(pet)}'s name is<br>in your wallet.
      </td></tr>
      <tr><td align="center" class="pad" style="padding:16px 52px 0 52px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.body};mso-line-height-rule:exactly;">
        ${hi ? `That's it, ${esc(hi)} — ` : "That's it — "}<strong style="color:${C.ink};">${nameOf(o)}</strong> has been sent to your wallet.
        It's permanently yours: nobody, including PetID, can take it back or change where it points.
      </td></tr>
      <tr><td align="center" class="pad" style="padding:24px 44px 0 44px;font-family:${MONO};font-size:13px;line-height:20px;color:${C.muted};word-break:break-all;">${esc(o.claim_to ?? "")}</td></tr>
      <tr><td align="center" style="padding:26px 44px 12px 44px;">${button(siteUrl(o), `Visit ${esc(pet)}'s website`)}</td></tr>
      <tr><td align="center" class="pad" style="padding:0 44px 40px 44px;font-family:${SANS};font-size:13px;line-height:20px;">
        <a href="https://etherscan.io/tx/${o.claim_tx}" style="color:${C.amberInk};">View the transaction</a>
        &nbsp;·&nbsp; <span style="color:${C.muted};">Order ${orderNo(o)}</span>
      </td></tr>
    </table>
  </td></tr>
  ${helpStrip(true)}`;

  const text = [
    `${nameOf(o)} has been sent to ${o.claim_to}.`,
    "",
    "It's yours permanently. Nobody, including PetID, can take it back.",
    `Transaction: https://etherscan.io/tx/${o.claim_tx}`,
    `Website: ${siteUrl(o)}`,
    "",
    `Order ${orderNo(o)}`,
  ].join("\n");

  return sendEmail(env, o.email, `${nameOf(o)} is now in your wallet`, text, shell(env,
    `${nameOf(o)} is permanently yours.`, sections));
}

export async function emailRefunded(env: Env, o: OrderRow) {
  const sections = `
  <tr><td style="background-color:${C.card};border:1px solid ${C.line};border-radius:20px 20px 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center" class="pad h1" style="padding:44px 44px 0 44px;font-family:${SERIF};font-size:32px;line-height:38px;color:${C.ink};mso-line-height-rule:exactly;">
        We've refunded your order.
      </td></tr>
      <tr><td align="center" class="pad" style="padding:16px 52px 0 52px;font-family:${SANS};font-size:16px;line-height:26px;color:${C.body};mso-line-height-rule:exactly;">
        Someone registered <strong style="color:${C.ink};">${nameOf(o)}</strong> while your payment was being processed, so we couldn't
        register it for you. Your card has been refunded in full — it usually appears within 5 to 10 business days.
      </td></tr>
      <tr><td align="center" style="padding:26px 44px 12px 44px;">${button(`${env.SITE_URL}/register/`, "Pick another name")}</td></tr>
      <tr><td align="center" class="pad" style="padding:0 44px 40px 44px;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};">Order ${orderNo(o)} · ${money(o.amount_cents)} refunded</td></tr>
    </table>
  </td></tr>
  ${helpStrip(true)}`;

  const text = [
    `Someone registered ${nameOf(o)} while your payment was being processed, so we`,
    "couldn't register it for you. We've refunded your card in full. It usually shows",
    "up within 5 to 10 business days.",
    "",
    `Pick another name any time: ${env.SITE_URL}/register/`,
    "",
    `Order ${orderNo(o)} · ${money(o.amount_cents)} refunded`,
  ].join("\n");

  return sendEmail(env, o.email, `Refund for ${nameOf(o)}`, text, shell(env,
    `Your card has been refunded in full.`, sections));
}
