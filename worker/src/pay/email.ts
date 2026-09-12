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
      // Always send the text part too: some clients prefer it, and a text
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

// ─── the branded receipt ─────────────────────────────────────────────────────

const nameOf = (o: OrderRow) => `${o.label}.${o.parent}`;
const accountUrl = (env: Env) => `${env.SITE_URL}/account/`;
/** Short, readable order number: the first block of the UUID, upper-cased. */
const orderNo = (o: OrderRow) => o.id.split("-")[0].toUpperCase();

/** Everything a customer sees is escaped: a pet's name is user input. */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CREAM = "#FBF5EC", CARD = "#FFFDF8", INK = "#3D2817", MUTED = "#8A6B4E", AMBER = "#C87A2E", LINE = "#E5D3B6";

/**
 * One table-based shell for every customer email. Inline styles only, no
 * external CSS and no web fonts — Gmail strips <style> blocks, and Outlook
 * ignores most of what survives. Max width 560px so it reads on a phone.
 */
function shell(opts: { title: string; intro: string; body: string; env: Env }): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${CREAM};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:28px 12px;">
<tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${CARD};border:1px solid ${LINE};border-radius:20px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td style="padding:26px 30px 0;">
      <div style="font-size:20px;font-weight:700;color:${INK};letter-spacing:-0.01em;">🐾 PetID</div>
    </td></tr>
    <tr><td style="padding:18px 30px 0;">
      <h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;color:${INK};letter-spacing:-0.02em;">${opts.title}</h1>
      <p style="margin:0;font-size:15px;line-height:1.65;color:#5C3E25;">${opts.intro}</p>
    </td></tr>
    ${opts.body}
    <tr><td style="padding:24px 30px 28px;border-top:1px solid ${LINE};">
      <p style="margin:0;font-size:12px;line-height:1.7;color:${MUTED};">
        PetID is operated by Only Buy Bitcoin LLC. Questions? Just reply to this email or write to
        <a href="mailto:${opts.env.NOTIFY_EMAIL}" style="color:${AMBER};">${opts.env.NOTIFY_EMAIL}</a>.<br>
        <a href="${opts.env.SITE_URL}/terms/" style="color:${MUTED};">Terms</a> ·
        <a href="${opts.env.SITE_URL}/privacy/" style="color:${MUTED};">Privacy</a>
      </p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:${AMBER};color:#FFFDF8;text-decoration:none;font-weight:700;font-size:15px;padding:13px 22px;border-radius:12px;">${label}</a>`;

const petBlock = (o: OrderRow) => {
  const url = `https://${nameOf(o)}.limo`;
  const photo = o.photo_url
    ? `<tr><td style="padding:22px 30px 0;">
         <img src="${esc(o.photo_url)}" width="500" alt="${esc(o.pet_name || nameOf(o))}"
              style="width:100%;max-width:500px;height:auto;border-radius:14px;border:1px solid ${LINE};display:block;">
       </td></tr>`
    : "";
  return `${photo}
    <tr><td style="padding:22px 30px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5E6D0;border-radius:14px;">
        <tr><td style="padding:16px 18px;">
          ${o.pet_name ? `<div style="font-size:17px;font-weight:700;color:${INK};margin-bottom:2px;">${esc(o.pet_name)}</div>` : ""}
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:14px;color:#A35E1B;word-break:break-all;">${nameOf(o)}</div>
          <div style="font-size:13px;color:${MUTED};margin-top:8px;"><a href="${url}" style="color:${AMBER};">${url}</a><br>
            <span style="color:${MUTED};">also works at ${nameOf(o)}.link</span></div>
        </td></tr>
      </table>
    </td></tr>`;
};

const orderLine = (o: OrderRow) =>
  `<tr><td style="padding:20px 30px 0;">
     <p style="margin:0;font-size:12px;color:${MUTED};">Order <b style="color:${INK};">#${orderNo(o)}</b> · $${(o.amount_cents / 100).toFixed(2)} paid by card</p>
   </td></tr>`;

export function emailMinted(env: Env, o: OrderRow) {
  const pet = o.pet_name || nameOf(o);
  const url = `https://${nameOf(o)}.limo`;
  const text = [
    `Thank you for your order!`,
    "",
    `${nameOf(o)} is registered and ${pet}'s page is live:`,
    url,
    `(the same page also works at https://${nameOf(o)}.link)`,
    "",
    "We're holding the name safely for you. Whenever you have a crypto wallet, sign in",
    "with this Google account and claim it — it's sent to you permanently, at no cost:",
    accountUrl(env),
    "",
    `Order #${orderNo(o)} · $${(o.amount_cents / 100).toFixed(2)}`,
  ].join("\n");

  const html = shell({
    env,
    title: `${esc(pet)}'s website is live`,
    intro: `Thank you for your order. ${esc(pet)}'s page is published and the name is registered on Ethereum — print the QR tag and it's ready for a collar.`,
    body: `${petBlock(o)}
      <tr><td style="padding:22px 30px 0;">${button(url, "Visit the website")}</td></tr>
      <tr><td style="padding:22px 30px 0;">
        <p style="margin:0;font-size:14px;line-height:1.65;color:#5C3E25;">
          <b style="color:${INK};">We're holding the name for you.</b> No crypto wallet needed today. Whenever you want it,
          sign in with this Google account and send it to a wallet — it's free, and from that moment nobody can take it back.
        </p>
        <p style="margin:14px 0 0;"><a href="${accountUrl(env)}" style="color:${AMBER};font-weight:700;font-size:14px;">Claim it to a wallet →</a></p>
      </td></tr>
      ${orderLine(o)}`,
  });
  return sendEmail(env, o.email, `${pet}'s website is live — ${nameOf(o)}`, text, html);
}

export function emailClaimed(env: Env, o: OrderRow) {
  const pet = o.pet_name || nameOf(o);
  const text = [
    `${nameOf(o)} has been sent to ${o.claim_to}.`,
    "",
    "It's yours permanently. Nobody, including PetID, can take it back.",
    `Transaction: https://etherscan.io/tx/${o.claim_tx}`,
    "",
    `Order #${orderNo(o)}`,
  ].join("\n");

  const html = shell({
    env,
    title: `${esc(pet)}'s name is in your wallet`,
    intro: `${nameOf(o)} has been sent to your wallet. It's yours permanently — nobody, including PetID, can take it back.`,
    body: `${petBlock(o)}
      <tr><td style="padding:22px 30px 0;">
        <p style="margin:0;font-size:13px;color:${MUTED};word-break:break-all;">Wallet: <span style="font-family:ui-monospace,Menlo,monospace;color:${INK};">${esc(o.claim_to ?? "")}</span></p>
        <p style="margin:8px 0 0;font-size:13px;"><a href="https://etherscan.io/tx/${o.claim_tx}" style="color:${AMBER};">View the transaction →</a></p>
      </td></tr>
      ${orderLine(o)}`,
  });
  return sendEmail(env, o.email, `${nameOf(o)} is now in your wallet`, text, html);
}

export function emailRefunded(env: Env, o: OrderRow) {
  const text = [
    `Someone registered ${nameOf(o)} while your payment was being processed, so we`,
    "couldn't register it for you. We've refunded your card in full. It usually shows",
    "up within 5 to 10 business days.",
    "",
    `Pick another name any time: ${env.SITE_URL}/register/`,
    "",
    `Order #${orderNo(o)}`,
  ].join("\n");

  const html = shell({
    env,
    title: "We've refunded your order",
    intro: `Someone registered <b>${nameOf(o)}</b> while your payment was being processed, so we couldn't register it for you. Your card has been refunded in full — it usually appears within 5 to 10 business days.`,
    body: `<tr><td style="padding:22px 30px 0;">${button(`${env.SITE_URL}/register/`, "Pick another name")}</td></tr>
      ${orderLine(o)}`,
  });
  return sendEmail(env, o.email, `Refund for ${nameOf(o)}`, text, html);
}
