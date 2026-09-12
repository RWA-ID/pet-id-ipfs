import type { Env } from "./env";
import type { OrderRow } from "./db";
import { short } from "./util";

/** Returns an error string instead of throwing: a failed email must never fail an order. */
export async function sendEmail(env: Env, to: string, subject: string, text: string): Promise<string | null> {
  if (!env.RESEND_API_KEY) return "RESEND_API_KEY not set";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.NOTIFY_FROM, to: [to], subject, text }),
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

const nameOf = (o: OrderRow) => `${o.label}.${o.parent}`;
const accountUrl = (env: Env) => `${env.SITE_URL}/account/`;

export function emailMinted(env: Env, o: OrderRow) {
  return sendEmail(env, o.email, `${nameOf(o)} is registered`, [
    "Thanks for your order!",
    "",
    `${nameOf(o)} is registered and its profile is live:`,
    `https://${nameOf(o)}.limo`,
    `(the same page also works at https://${nameOf(o)}.link)`,
    "",
    "We're holding the name safely for you. Whenever you have a crypto wallet, sign in",
    "with this Google account and claim it. It's sent to you permanently, at no cost:",
    accountUrl(env),
    "",
    `Order ${o.id}`,
  ].join("\n"));
}

export function emailClaimed(env: Env, o: OrderRow) {
  return sendEmail(env, o.email, `${nameOf(o)} is now in your wallet`, [
    `${nameOf(o)} has been sent to ${o.claim_to}.`,
    "",
    "It's yours permanently. Nobody, including PetID, can take it back.",
    `Transaction: https://etherscan.io/tx/${o.claim_tx}`,
    "",
    `Order ${o.id}`,
  ].join("\n"));
}

export function emailRefunded(env: Env, o: OrderRow) {
  return sendEmail(env, o.email, `Refund for ${nameOf(o)}`, [
    `Someone registered ${nameOf(o)} while your payment was being processed, so we`,
    "couldn't register it for you. We've refunded your card in full. It usually shows",
    "up within 5 to 10 business days.",
    "",
    `Pick another name any time: ${env.SITE_URL}/register/`,
    "",
    `Order ${o.id}`,
  ].join("\n"));
}
