/**
 * The four Stripe calls this worker makes, over plain fetch. Stripe's API takes
 * form-encoded bodies with bracketed nesting (line_items[0][price_data][…]),
 * which is all the SDK would be doing for us.
 */
import type { Env } from "./env";

const API = "https://api.stripe.com/v1";
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

async function call<T>(env: Env, path: string, params: Params = {}, idempotencyKey?: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  // A retried request with the same key returns the original result instead of
  // creating a second session or a second refund.
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`${API}${path}`, { method: "POST", headers, body: flatten(params).toString() });
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
  o: { orderId: string; name: string; email: string; amountCents: number; successUrl: string; cancelUrl: string },
): Promise<CheckoutSession> {
  return call<CheckoutSession>(env, "/checkout/sessions", {
    mode: "payment",
    customer_email: o.email,
    client_reference_id: o.orderId,
    metadata: { order_id: o.orderId },
    // Refunds and disputes arrive as charge events, which only carry the
    // payment intent — this is how they find their way back to the order.
    payment_intent_data: { metadata: { order_id: o.orderId }, description: `PetID ${o.name}` },
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
