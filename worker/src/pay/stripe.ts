/**
 * The Stripe calls this worker makes, over plain fetch. Stripe's API takes
 * form-encoded bodies with bracketed nesting (line_items[0][price_data][…]),
 * which is all the SDK would be doing for us.
 */
import type { Env } from "./env";

const enc = new TextEncoder();

type Params = { [key: string]: string | number | undefined | Params | Params[] };

function flatten(obj: Params, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => flatten(item, `${key}[${i}]`, out));
    else if (typeof v === "object") flatten(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call<T>(
  env: Env, path: string, params: Params = {}, idempotencyKey?: string, method: "GET" | "POST" | "DELETE" = "POST",
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  // A retried request with the same key returns the original result instead of
  // creating a second session, refund, account or transfer.
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const api = `${(env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/+$/, "")}/v1`;
  const res = await fetch(`${api}${path}`, { method, headers, body: method === "POST" ? flatten(params).toString() : undefined });
  const data = (await res.json()) as { error?: { code?: string; message?: string } };
  if (!res.ok) {
    throw new Error(`stripe ${res.status} ${data.error?.code ?? ""}: ${(data.error?.message ?? "").slice(0, 200)}`);
  }
  return data as T;
}

export interface CheckoutSession {
  id: string;
  url: string;
  payment_status: string;
  payment_intent: string | null;
}

export function createCheckoutSession(
  env: Env,
  o: {
    orderId: string; name: string; email: string; amountCents: number; successUrl: string; cancelUrl: string;
    /** The referring shop, if any. Only for reading the Stripe dashboard; the order row is the record. */
    partnerCode?: string;
  },
): Promise<CheckoutSession> {
  const metadata = { order_id: o.orderId, partner: o.partnerCode };
  return call<CheckoutSession>(env, "/checkout/sessions", {
    mode: "payment",
    customer_email: o.email,
    client_reference_id: o.orderId,
    metadata,
    // Refunds and disputes arrive as charge events, which only carry the
    // payment intent — this is how they find their way back to the order.
    payment_intent_data: { metadata, description: `PetID ${o.name}` },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: o.amountCents,
        product_data: {
          name: o.name,
          description: "PetID pet identity. We hold the name for you until you claim it to a wallet.",
        },
      },
    }],
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
    // Stripe's minimum is 30 minutes. The name is reserved for exactly this long.
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
  }, `checkout-${o.orderId}`);
}

/** Ends an unpaid session so its name reservation can be released. Throws if it was already paid. */
export function expireCheckoutSession(env: Env, sessionId: string) {
  return call<CheckoutSession>(env, `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`);
}

export function refundPaymentIntent(env: Env, paymentIntent: string, orderId: string) {
  return call<{ id: string; status: string }>(env, "/refunds", {
    payment_intent: paymentIntent,
    metadata: { order_id: orderId },
  }, `refund-${orderId}`);
}

// ─── Connect: paying pet shops ───────────────────────────────────────────────

/**
 * Stripe's v2 API version. v2 endpoints refuse a request without one, and take
 * JSON rather than form bodies. Pinned rather than "latest": a new version can
 * rename fields, as this one already dropped the account link's
 * `configurations` (the account's own configuration decides now).
 */
const V2_VERSION = "2026-09-30.endive";

async function callV2<T>(
  env: Env, method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Stripe-Version": V2_VERSION,
    "Content-Type": "application/json",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const base = (env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json()) as { error?: { code?: string; message?: string } };
  if (!res.ok) {
    throw new Error(`stripe ${res.status} ${data.error?.code ?? ""}: ${(data.error?.message ?? "").slice(0, 200)}`);
  }
  return data as T;
}

/** The parts of a v2 Account we read. */
export interface ConnectedAccount {
  id: string;
  configuration?: {
    recipient?: { capabilities?: { stripe_balance?: { stripe_transfers?: { status?: string } } } };
  };
  requirements?: { summary?: { minimum_deadline?: { status?: string } } };
}

/** "active" once Stripe will accept transfers to this account. */
export const transfersStatus = (a: ConnectedAccount) =>
  a.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;

/**
 * A shop's account, created with Accounts v2 (Stripe refuses v1 creation for
 * new Connect platforms). A "recipient" that can only receive transfers into
 * its Stripe balance: the shop never takes card payments itself, it receives a
 * share of ours. Express dashboard, so Stripe hosts its onboarding, identity
 * checks, bank details, tax forms and payout page. We collect the fees and
 * carry the losses, as the platform taking the customer's money.
 *
 * US only for now: our platform account is US, and a cross-border recipient
 * is a different agreement that not every country supports.
 */
export function createConnectedAccount(
  env: Env, o: { partnerCode: string; email: string; businessName: string },
) {
  return callV2<ConnectedAccount>(env, "POST", "/v2/core/accounts", {
    display_name: o.businessName,
    contact_email: o.email,
    identity: { country: "us" },
    dashboard: "express",
    defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" } },
    configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } },
    metadata: { partner_code: o.partnerCode },
  }, `connect-account-${o.partnerCode}`);
}

export const getConnectedAccount = (env: Env, id: string) =>
  callV2<ConnectedAccount>(env, "GET",
    `/v2/core/accounts/${encodeURIComponent(id)}?include=configuration.recipient&include=requirements`);

/** A one-time link into Stripe's hosted onboarding. Expires in minutes; make a new one per click. */
export function createOnboardingLink(env: Env, account: string, returnUrl: string, refreshUrl: string) {
  return callV2<{ url: string }>(env, "POST", "/v2/core/account_links", {
    account,
    use_case: { type: "account_onboarding", account_onboarding: { return_url: returnUrl, refresh_url: refreshUrl } },
  });
}

// The dashboard link and transfers stay on v1: Stripe accepts v2 accounts for both
// (checked in test mode), and a v1 transfer to a v2 recipient is the documented path.

/** A one-time sign-in to the shop's Stripe Express dashboard: its payouts, bank and tax forms. */
export const createDashboardLink = (env: Env, account: string) =>
  call<{ url: string }>(env, `/accounts/${encodeURIComponent(account)}/login_links`);

/** Moves money from our balance to the shop's. Keyed on the payout id, so a retry can't pay twice. */
export function createTransfer(
  env: Env, o: { payoutId: string; partnerCode: string; account: string; amountCents: number; description: string },
) {
  return call<{ id: string }>(env, "/transfers", {
    amount: o.amountCents,
    currency: "usd",
    destination: o.account,
    transfer_group: `payout-${o.payoutId}`,
    description: o.description,
    metadata: { payout_id: o.payoutId, partner_code: o.partnerCode },
  }, `transfer-${o.payoutId}`);
}

/**
 * Stripe-Signature: t=<unix>,v1=<hex hmac of "t.body">[,v1=…]. More than one v1
 * appears while a webhook secret is being rolled, so accept any that matches.
 * The timestamp bound stops a captured request being replayed later.
 */
export async function verifyStripeSignature(
  raw: string, header: string | null, secret: string, toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  const fields = header.split(",").map((f) => f.split("="));
  const t = fields.find(([k]) => k === "t")?.[1];
  const sigs = fields.filter(([k, v]) => k === "v1" && /^[0-9a-f]{64}$/.test(v ?? "")).map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;

  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const data = enc.encode(`${t}.${raw}`);
  for (const hex of sigs) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (await crypto.subtle.verify("HMAC", key, bytes, data)) return true;
  }
  return false;
}
