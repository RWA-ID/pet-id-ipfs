/**
 * PetID card payments.
 *
 * The site is a static export on IPFS, so everything that needs a secret lives
 * here: Google sign-in, Stripe Checkout, and the fulfiller wallet that mints
 * card-paid names into PetIDRegistrarV5's custody and releases them on claim.
 *
 * Order lifecycle (orders.status):
 *
 *   pending ──checkout.session.completed──▶ paid ──mint sent──▶ minting ──receipt──▶ minted
 *   minted ──claim signed by the wallet──▶ claim_requested ──sent──▶ claiming ──receipt──▶ claimed
 *
 *   pending ──session expired / replaced──▶ expired | canceled
 *   paid, name taken on-chain meanwhile ──▶ refunded   (card refunded here)
 *   refund or dispute once minted ──▶ revoke_needed ──owner revokes on-chain──▶ revoked
 *
 * Every transition is a compare-and-set on the previous status (updateOrder),
 * because the same order is reachable from Stripe's retries, the cron and the
 * buyer at once.
 *
 * Chain writes happen only in processQueue(), under a D1 lease, with one
 * transaction in flight at a time: the fulfiller is a single EOA, and two
 * concurrent sends would race for its nonce.
 */
import { formatEther, getAddress, isAddress, namehash, zeroHash, type Hex } from "viem";
import {
  chain, claimMessage, gasTooHigh, isAvailable, NAME_WRAPPER, nodeOf, orderRefFor,
  REGISTRAR_ABI, WRAPPER_ABI, type Chain,
} from "./chain";
import {
  acquireLease, getOrder, publicOrder, releaseLease, shouldAlert, updateOrder,
  type OrderRow, type OrderStatus,
} from "./db";
import { alertAdmin, emailClaimed, emailMinted, emailRefunded } from "./email";
import type { Env } from "./env";
import { verifyGoogleIdToken } from "./google";
import { issueSession, sessionFrom, type Session } from "./session";
import { createCheckoutSession, expireCheckoutSession, refundPaymentIntent, verifyStripeSignature } from "./stripe";
import { allowedOrigins, corsHeaders, json, labelError, PARENTS, readJson, short } from "./util";

type Cors = Record<string, string>;

/** A paid order that fails to mint this many times stops retrying and pages the admin. */
const MAX_ATTEMPTS = 5;
/**
 * Warn (at most every 6 hours) below 0.001 ETH: ~27 card sales of mint + claim
 * at 0.09 gwei, enough runway to top up. It was 0.003 ETH, which is what the
 * wallet was first funded with, so the very first mint would have started the
 * alerts.
 */
const LOW_BALANCE_WEI = 1_000_000_000_000_000n;
/** Unpaid checkouts a single account may hold open, each reserving a name. */
const MAX_OPEN_CHECKOUTS = 3;

export default {
  async fetch(req, env, ctx): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    try {
      // Unauthenticated: Stripe signs its own requests, Google's token is the credential.
      if (url.pathname === "/stripe/webhook" && req.method === "POST") return await handleWebhook(req, env, ctx);
      if (url.pathname === "/auth/google" && req.method === "POST") return await handleGoogle(req, env, cors);
      if (url.pathname === "/health") return json({ ok: true }, 200, cors);
      if (url.pathname.startsWith("/admin/")) return await handleAdmin(req, env, ctx, url);

      const user = await sessionFrom(req, env.SESSION_SECRET);
      if (!user) return json({ error: "sign in required" }, 401, cors);

      if (url.pathname === "/me" && req.method === "GET") return await handleMe(env, user, cors);
      if (url.pathname === "/checkout" && req.method === "POST") return await handleCheckout(req, env, user, cors);

      const m = url.pathname.match(/^\/orders\/([0-9a-f-]{36})(\/claim|\/claim-message)?$/);
      if (m && !m[2] && req.method === "GET") return await handleGetOrder(env, user, m[1], cors);
      if (m && m[2] === "/claim-message" && req.method === "GET") return await handleClaimMessage(env, user, m[1], url, cors);
      if (m && m[2] === "/claim" && req.method === "POST") return await handleClaim(req, env, ctx, user, m[1], cors);

      return json({ error: "not found" }, 404, cors);
    } catch (e) {
      console.error("unhandled", short(e));
      return json({ error: "internal error" }, 500, cors);
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(processQueue(env).then(() => sweep(env)));
  },
} satisfies ExportedHandler<Env>;

// ─── Sign-in ──────────────────────────────────────────────────────────────────

async function handleGoogle(req: Request, env: Env, cors: Cors) {
  const body = await readJson(req);
  const credential = typeof body?.credential === "string" ? body.credential : "";
  if (!credential || credential.length > 4096) return json({ error: "missing credential" }, 400, cors);

  const id = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID);
  if (!id) return json({ error: "Google sign-in could not be verified" }, 401, cors);

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (sub, email, name, created_at, last_login) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (sub) DO UPDATE SET email = excluded.email, name = excluded.name, last_login = excluded.last_login`,
  ).bind(id.sub, id.email, id.name ?? null, now, now).run();

  const token = await issueSession(env.SESSION_SECRET, { sub: id.sub, email: id.email, name: id.name });
  return json({ token, user: { email: id.email, name: id.name ?? null, picture: id.picture ?? null } }, 200, cors);
}

async function handleMe(env: Env, user: Session, cors: Cors) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM orders WHERE user_sub = ? AND status NOT IN ('expired', 'canceled')
     ORDER BY created_at DESC LIMIT 100`,
  ).bind(user.sub).all<OrderRow>();
  return json({ user: { email: user.email, name: user.name ?? null }, orders: results.map(publicOrder) }, 200, cors);
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

/** The page to send the buyer back to — only on a host we serve from, or this is an open redirect. */
function returnUrlFor(raw: string, env: Env): string | null {
  try {
    const u = new URL(raw);
    return allowedOrigins(env).includes(u.origin) ? `${u.origin}${u.pathname}` : null;
  } catch {
    return null;
  }
}

async function handleCheckout(req: Request, env: Env, user: Session, cors: Cors) {
  const body = await readJson(req);
  const parent = String(body?.parent ?? "");
  const label = String(body?.label ?? "");
  const contenthash = String(body?.contenthash ?? "").toLowerCase();
  const returnUrl = returnUrlFor(String(body?.returnUrl ?? ""), env);

  if (!(PARENTS as readonly string[]).includes(parent)) return json({ error: "unsupported name" }, 400, cors);
  const bad = labelError(label);
  if (bad) return json({ error: bad }, 400, cors);
  // An IPFS contenthash as the site encodes it (0xe301…); bounded so it can't bloat a row.
  if (!/^0xe301[0-9a-f]{8,160}$/.test(contenthash)) return json({ error: "invalid profile" }, 400, cors);
  if (!returnUrl) return json({ error: "invalid return URL" }, 400, cors);

  // Re-opening checkout for a name this account is already paying for replaces
  // the old session instead of tripping over its own reservation.
  const mine = await env.DB.prepare(
    "SELECT * FROM orders WHERE parent = ? AND label = ? AND status = 'pending' AND user_sub = ?",
  ).bind(parent, label, user.sub).first<OrderRow>();
  if (mine) {
    if (mine.stripe_session_id) {
      try {
        await expireCheckoutSession(env, mine.stripe_session_id);
      } catch {
        return json({ error: "Your earlier checkout for this name may have gone through. Check your account." }, 409, cors);
      }
    }
    await updateOrder(env, mine.id, { status: "canceled" }, ["pending"]);
  }

  const open = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM orders WHERE user_sub = ? AND status = 'pending'",
  ).bind(user.sub).first<{ n: number }>();
  if ((open?.n ?? 0) >= MAX_OPEN_CHECKOUTS) {
    return json({ error: "You have too many unfinished checkouts. Try again in 30 minutes." }, 429, cors);
  }

  if (!(await isAvailable(chain(env), parent, label))) return json({ error: "That name is already taken." }, 409, cors);

  const id = crypto.randomUUID();
  const now = Date.now();
  const amount = Number(env.PRICE_CENTS);
  try {
    await env.DB.prepare(
      `INSERT INTO orders (id, user_sub, email, parent, label, contenthash, amount_cents, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).bind(id, user.sub, user.email, parent, label, contenthash, amount, now, now).run();
  } catch (e) {
    if (String(e).includes("UNIQUE")) {
      return json({ error: "Someone else is checking out this name right now. Try again in 30 minutes." }, 409, cors);
    }
    throw e;
  }

  try {
    const session = await createCheckoutSession(env, {
      orderId: id,
      name: `${label}.${parent}`,
      email: user.email,
      amountCents: amount,
      successUrl: `${returnUrl}?order=${id}&checkout=success`,
      cancelUrl: `${returnUrl}?order=${id}&checkout=canceled`,
    });
    await updateOrder(env, id, { stripe_session_id: session.id, order_ref: orderRefFor(session.id) });
    return json({ url: session.url, orderId: id }, 200, cors);
  } catch (e) {
    console.error("checkout session failed", short(e));
    await updateOrder(env, id, { status: "canceled", error: short(e) }, ["pending"]);
    return json({ error: "The payment page couldn't be opened. Please try again." }, 502, cors);
  }
}

// ─── Orders and claims ────────────────────────────────────────────────────────

const ownOrder = (env: Env, user: Session, id: string) =>
  env.DB.prepare("SELECT * FROM orders WHERE id = ? AND user_sub = ?").bind(id, user.sub).first<OrderRow>();

async function handleGetOrder(env: Env, user: Session, id: string, cors: Cors) {
  const o = await ownOrder(env, user, id);
  return o ? json({ order: publicOrder(o) }, 200, cors) : json({ error: "order not found" }, 404, cors);
}

async function handleClaimMessage(env: Env, user: Session, id: string, url: URL, cors: Cors) {
  const o = await ownOrder(env, user, id);
  if (!o) return json({ error: "order not found" }, 404, cors);
  const to = url.searchParams.get("to") ?? "";
  if (!isAddress(to)) return json({ error: "invalid wallet address" }, 400, cors);
  return json({ message: claimMessage(o, getAddress(to)) }, 200, cors);
}

/**
 * The buyer's wallet signs the claim message before anything is sent. Releasing
 * a name is irreversible, so this is what stops a mistyped or pasted-wrong
 * address from receiving it: only a wallet that can sign can be the recipient.
 */
async function handleClaim(req: Request, env: Env, ctx: ExecutionContext, user: Session, id: string, cors: Cors) {
  const o = await ownOrder(env, user, id);
  if (!o) return json({ error: "order not found" }, 404, cors);
  if (o.status !== "minted") return json({ error: `This order is ${o.status.replace(/_/g, " ")}, not ready to claim.` }, 409, cors);

  const body = await readJson(req);
  const rawTo = String(body?.to ?? "");
  const signature = String(body?.signature ?? "");
  if (!isAddress(rawTo)) return json({ error: "invalid wallet address" }, 400, cors);
  if (!/^0x[0-9a-fA-F]{130,}$/.test(signature)) return json({ error: "invalid signature" }, 400, cors);
  const to = getAddress(rawTo);

  // The public client's verifyMessage also accepts smart-contract wallets (ERC-1271 / ERC-6492).
  const valid = await chain(env).pub
    .verifyMessage({ address: to, message: claimMessage(o, to), signature: signature as Hex })
    .catch(() => false);
  if (!valid) return json({ error: "That signature doesn't come from this wallet." }, 400, cors);

  if (!(await updateOrder(env, o.id, { status: "claim_requested", claim_to: to, error: null }, ["minted"]))) {
    return json({ error: "This order just changed. Refresh and try again." }, 409, cors);
  }
  ctx.waitUntil(processQueue(env));
  return json({ order: publicOrder((await getOrder(env, o.id))!) }, 200, cors);
}

// ─── Stripe webhook ───────────────────────────────────────────────────────────

async function handleWebhook(req: Request, env: Env, ctx: ExecutionContext) {
  const raw = await req.text();
  if (!(await verifyStripeSignature(raw, req.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: "invalid signature" }, 400);
  }
  const event = JSON.parse(raw) as { type: string; data: { object: Record<string, any> } };
  const obj = event.data.object;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      // The account may sell other things too; only sessions this worker created carry an order id.
      // An async method (bank debit) completes unpaid and settles later with async_payment_succeeded.
      if (obj.metadata?.order_id && obj.payment_status === "paid") await markPaid(env, ctx, obj.id, obj.payment_intent ?? null);
      break;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      await env.DB.prepare("UPDATE orders SET status = 'expired', updated_at = ? WHERE stripe_session_id = ? AND status = 'pending'")
        .bind(Date.now(), obj.id).run();
      break;
    case "charge.refunded":
      await onMoneyReturned(env, obj.payment_intent, obj.refunded === true ? "refunded" : "partially refunded");
      break;
    case "charge.dispute.created":
      await onMoneyReturned(env, obj.payment_intent, "disputed");
      break;
  }
  // Anything thrown above becomes a 500, and Stripe retries the event.
  return json({ received: true });
}

async function markPaid(env: Env, ctx: ExecutionContext, sessionId: string, paymentIntent: string | null) {
  const o = await env.DB.prepare("SELECT * FROM orders WHERE stripe_session_id = ?").bind(sessionId).first<OrderRow>();
  if (!o) {
    await alertAdmin(env, "Payment with no order", `Stripe session ${sessionId} was paid but has no order row. Refund it in Stripe.`);
    return;
  }
  try {
    if (await updateOrder(env, o.id, { status: "paid", payment_intent: paymentIntent }, ["pending", "expired", "canceled"])) {
      ctx.waitUntil(processQueue(env));
    }
  } catch (e) {
    // Paid after its reservation lapsed, and another order has taken the name since.
    if (!String(e).includes("UNIQUE")) throw e;
    await updateOrder(env, o.id, { payment_intent: paymentIntent });
    await refundOrder(env, { ...o, payment_intent: paymentIntent }, "name reserved by another order");
  }
}

async function onMoneyReturned(env: Env, paymentIntent: string | undefined, why: string) {
  if (!paymentIntent) return;
  const o = await env.DB.prepare("SELECT * FROM orders WHERE payment_intent = ?").bind(paymentIntent).first<OrderRow>();
  if (!o) return;
  const name = `${o.label}.${o.parent}`;

  if (why === "partially refunded") {
    await alertAdmin(env, `Partial refund on ${name}`, `Order ${o.id} (${o.status}). The name is untouched.`);
    return;
  }
  if (o.status === "refunded" || o.status === "revoke_needed" || o.status === "revoked") return;
  if (o.status === "paid" && (await updateOrder(env, o.id, { status: "refunded", error: `payment ${why} before minting` }, ["paid"]))) return;

  if (await updateOrder(env, o.id, { status: "revoke_needed", error: `payment ${why}` }, ["minting", "minted", "claim_requested"])) {
    await alertAdmin(env, `Revoke ${name}: payment ${why}`, [
      `Order ${o.id} was ${why} while ${name} is still in custody.`,
      "",
      `1. If it was minting, wait for ${o.mint_tx ?? "the mint"} to confirm.`,
      `2. From the owner wallet, call revokeCustodial(${namehash(o.parent)}, "${o.label}") on ${env.REGISTRAR_ADDRESS}.`,
      `3. POST /admin/orders/${o.id}/revoked to free the name here.`,
    ].join("\n"));
    return;
  }
  const now = await getOrder(env, o.id);
  await alertAdmin(env, `Payment ${why} after ${name} left custody`, [
    `Order ${o.id} is ${now?.status}. The name was sent to ${now?.claim_to} and can't be revoked.`,
    `Claim transaction: ${now?.claim_tx ?? "(pending)"}. Use it as evidence if this is a dispute.`,
  ].join("\n"));
}

// ─── Chain queue ──────────────────────────────────────────────────────────────

export async function processQueue(env: Env): Promise<void> {
  const holder = crypto.randomUUID();
  if (!(await acquireLease(env, "chain", holder, 60_000))) return;
  try {
    const c = chain(env);
    // Inside a scheduled or waitUntil budget, with room to spare.
    const deadline = Date.now() + 20_000;

    const inflight = await env.DB.prepare(
      "SELECT * FROM orders WHERE status IN ('minting', 'claiming') ORDER BY updated_at LIMIT 1",
    ).first<OrderRow>();
    if (inflight && !(await settle(env, c, inflight, deadline))) return;

    await checkBalance(env, c);

    while (Date.now() < deadline) {
      const next = await env.DB.prepare(
        `SELECT * FROM orders WHERE status = 'claim_requested' OR (status = 'paid' AND attempts < ?)
         ORDER BY CASE status WHEN 'claim_requested' THEN 0 ELSE 1 END, updated_at LIMIT 1`,
      ).bind(MAX_ATTEMPTS).first<OrderRow>();
      if (!next || (await gasTooHigh(env, c))) return;

      const moved = next.status === "paid" ? await sendMint(env, c, next) : await sendClaim(env, c, next);
      if (!moved) return;
      const row = await getOrder(env, next.id);
      if (row && !(await settle(env, c, row, deadline))) return;
    }
  } catch (e) {
    console.error("queue", short(e));
  } finally {
    await releaseLease(env, "chain", holder);
  }
}

/** true = the order moved on (sent, or resolved without a transaction); false = stop for this run. */
async function sendMint(env: Env, c: Chain, o: OrderRow): Promise<boolean> {
  const name = `${o.label}.${o.parent}`;
  const orderRef = o.order_ref as Hex;

  // An earlier attempt may have landed without its bookkeeping (worker killed after broadcasting).
  const minted = await c.pub.readContract({
    address: c.registrar, abi: REGISTRAR_ABI, functionName: "orderNode", args: [orderRef],
  });
  if (minted !== zeroHash) {
    if (await updateOrder(env, o.id, { status: "minted", error: null }, ["paid"])) await emailMinted(env, o);
    return true;
  }
  if (!(await isAvailable(c, o.parent, o.label))) {
    await refundOrder(env, o, "name registered by someone else before the mint");
    return true;
  }

  try {
    const { request } = await c.pub.simulateContract({
      account: c.account, address: c.registrar, abi: REGISTRAR_ABI, functionName: "mintCustodial",
      args: [namehash(o.parent), o.label, o.contenthash as Hex, orderRef],
    });
    const hash = await c.wallet.writeContract(request);
    await updateOrder(env, o.id, { mint_tx: hash });
    if (!(await updateOrder(env, o.id, { status: "minting", error: null }, ["paid"]))) {
      const now = await getOrder(env, o.id);
      await alertAdmin(env, `Minted ${name} for an order that is now ${now?.status}`,
        `Mint ${hash} was sent as order ${o.id} changed state. If it confirms, revoke the name and mark the order revoked.`);
    }
    return true;
  } catch (e) {
    const message = short(e);
    // Some failures block every mint rather than this one — a missing
    // NameWrapper approval, a parent removed from the registrar. Spending an
    // order's retries on those means that once the cause is fixed, each order
    // needs a manual retry. Keep retrying and page the admin instead.
    if (/Registrar not approved on NameWrapper|Unsupported parent/.test(message)) {
      await updateOrder(env, o.id, { error: message }, ["paid"]);
      if (await shouldAlert(env, "mints-blocked", 6 * 3600_000)) {
        await alertAdmin(env, "Mints are blocked", [
          message,
          "",
          `Paid orders keep retrying every minute. If this is the approval, the Safe must call`,
          `setApprovalForAll(${env.REGISTRAR_ADDRESS}, true) on the NameWrapper.`,
        ].join("\n"));
      }
      return false;
    }
    const attempts = o.attempts + 1;
    await updateOrder(env, o.id, { attempts, error: message }, ["paid"]);
    if (attempts >= MAX_ATTEMPTS) {
      await alertAdmin(env, `Mint failing for ${name}`,
        `Order ${o.id} failed ${attempts} times and has stopped retrying.\nLast error: ${short(e)}\n\nRetry: POST /admin/orders/${o.id}/retry`);
    }
    return false;
  }
}

async function sendClaim(env: Env, c: Chain, o: OrderRow): Promise<boolean> {
  const name = `${o.label}.${o.parent}`;
  const to = getAddress(o.claim_to!);
  const node = nodeOf(o.parent, o.label);

  const custody = await c.pub.readContract({
    address: c.registrar, abi: REGISTRAR_ABI, functionName: "custodyOrder", args: [node],
  });
  if (custody === zeroHash) {
    const owner = await c.pub.readContract({ address: NAME_WRAPPER, abi: WRAPPER_ABI, functionName: "ownerOf", args: [BigInt(node)] });
    if (owner === to) {
      // Released by an earlier attempt whose bookkeeping didn't land.
      if (await updateOrder(env, o.id, { status: "claimed", error: null }, ["claim_requested"])) await emailClaimed(env, o);
      return true;
    }
    await updateOrder(env, o.id, { status: "minted", claim_to: null, error: "name is not in custody" }, ["claim_requested"]);
    await alertAdmin(env, `${name} is not in custody`, `Order ${o.id} asked to claim to ${to}, but the registrar holds no custody record. Owner is ${owner}.`);
    return false;
  }

  try {
    const { request } = await c.pub.simulateContract({
      account: c.account, address: c.registrar, abi: REGISTRAR_ABI, functionName: "releaseCustodial",
      args: [namehash(o.parent), o.label, to],
    });
    const hash = await c.wallet.writeContract(request);
    await updateOrder(env, o.id, { claim_tx: hash });
    if (!(await updateOrder(env, o.id, { status: "claiming", error: null }, ["claim_requested"]))) {
      const now = await getOrder(env, o.id);
      await alertAdmin(env, `Released ${name} for an order that is now ${now?.status}`, `Release ${hash} for order ${o.id} was already sent.`);
    }
    return true;
  } catch (e) {
    // Not retried automatically: most causes (a wallet that can't hold ERC-1155 tokens) need the buyer.
    await updateOrder(env, o.id, { status: "minted", claim_to: null, error: `claim failed: ${short(e)}` }, ["claim_requested"]);
    return false;
  }
}

/** true = no longer in flight; false = still waiting on the chain, so send nothing else. */
async function settle(env: Env, c: Chain, o: OrderRow, deadline: number): Promise<boolean> {
  const isMint = o.status === "minting";
  if (!isMint && o.status !== "claiming") return true;

  const hash = (isMint ? o.mint_tx : o.claim_tx) as Hex | null;
  if (!hash) {
    await updateOrder(env, o.id, { status: isMint ? "paid" : "claim_requested" }, [o.status]);
    return true;
  }

  const receipt = await waitReceipt(c, hash, deadline);
  if (!receipt) {
    if (Date.now() - o.updated_at > 30 * 60_000 && (await shouldAlert(env, `stuck:${hash}`, 6 * 3600_000))) {
      await alertAdmin(env, `Transaction stuck for ${o.label}.${o.parent}`,
        `${hash} (order ${o.id}) has had no receipt for over 30 minutes. Card orders are queued behind it.`);
    }
    return false;
  }

  // A mined transaction can still have failed. Only the receipt status says so; nothing throws.
  if (receipt.status === "success") {
    if (isMint) {
      if (await updateOrder(env, o.id, { status: "minted", error: null }, ["minting"])) await emailMinted(env, o);
    } else if (await updateOrder(env, o.id, { status: "claimed", error: null }, ["claiming"])) {
      await emailClaimed(env, o);
    }
  } else if (isMint) {
    // Back to paid: sendMint re-checks whether the name was taken and refunds if so.
    await updateOrder(env, o.id, { status: "paid", attempts: o.attempts + 1, error: `mint reverted in ${hash}` }, ["minting"]);
  } else {
    await updateOrder(env, o.id, { status: "minted", claim_to: null, claim_tx: null, error: `claim reverted in ${hash}` }, ["claiming"]);
  }
  return true;
}

async function waitReceipt(c: Chain, hash: Hex, deadline: number) {
  try {
    const timeout = deadline - Date.now();
    return timeout > 2_000
      ? await c.pub.waitForTransactionReceipt({ hash, timeout, pollingInterval: 3_000 })
      : await c.pub.getTransactionReceipt({ hash });
  } catch {
    return null;
  }
}

async function refundOrder(env: Env, o: OrderRow, reason: string) {
  const name = `${o.label}.${o.parent}`;
  if (!o.payment_intent) {
    if (await shouldAlert(env, `refund:${o.id}`, 6 * 3600_000)) {
      await alertAdmin(env, `Refund ${name} by hand`, `Order ${o.id} needs a refund (${reason}) but has no payment intent.`);
    }
    return;
  }
  try {
    await refundPaymentIntent(env, o.payment_intent, o.id);
  } catch (e) {
    await updateOrder(env, o.id, { error: `refund failed: ${short(e)}` });
    if (await shouldAlert(env, `refund:${o.id}`, 6 * 3600_000)) {
      await alertAdmin(env, `Refund failed for ${name}`, `Order ${o.id}: ${short(e)}. Refund it in Stripe.`);
    }
    return;
  }
  if (await updateOrder(env, o.id, { status: "refunded", error: reason })) await emailRefunded(env, o);
}

async function checkBalance(env: Env, c: Chain) {
  const balance = await c.pub.getBalance({ address: c.account.address });
  if (balance < LOW_BALANCE_WEI && (await shouldAlert(env, "low-balance", 6 * 3600_000))) {
    await alertAdmin(env, "Fulfiller wallet is low on gas",
      `${c.account.address} holds ${formatEther(balance)} ETH. Top it up, or card orders will stop minting.`);
  }
}

/** Stripe expires sessions at 31 minutes and says so by webhook; this catches a missed one. */
async function sweep(env: Env) {
  const now = Date.now();
  await env.DB.prepare("UPDATE orders SET status = 'expired', updated_at = ? WHERE status = 'pending' AND created_at < ?")
    .bind(now, now - 2 * 3600_000).run();
}

// ─── Admin ────────────────────────────────────────────────────────────────────

async function handleAdmin(req: Request, env: Env, ctx: ExecutionContext, url: URL) {
  if (!env.ADMIN_TOKEN || req.headers.get("Authorization") !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ error: "unauthorized" }, 401);
  }

  if (req.method === "GET" && url.pathname === "/admin/orders") {
    const status = url.searchParams.get("status");
    const stmt = status
      ? env.DB.prepare("SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT 200").bind(status)
      : env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200");
    return json({ orders: (await stmt.all<OrderRow>()).results });
  }

  const m = url.pathname.match(/^\/admin\/orders\/([0-9a-f-]{36})\/(retry|revoked)$/);
  if (req.method === "POST" && m) {
    const o = await getOrder(env, m[1]);
    if (!o) return json({ error: "order not found" }, 404);

    if (m[2] === "retry") {
      const ok = await updateOrder(env, o.id, { attempts: 0, error: null }, ["paid"]);
      if (ok) ctx.waitUntil(processQueue(env));
      return json({ ok });
    }

    // Only after the owner's revokeCustodial has actually landed.
    const c = chain(env);
    const custody = await c.pub.readContract({
      address: c.registrar, abi: REGISTRAR_ABI, functionName: "custodyOrder", args: [nodeOf(o.parent, o.label)],
    });
    if (custody !== zeroHash) return json({ error: "Still in custody on-chain. revokeCustodial hasn't landed." }, 409);
    const ok = await updateOrder(env, o.id, { status: "revoked" } as { status: OrderStatus }, ["revoke_needed"]);
    return json({ ok, nameAvailable: await isAvailable(c, o.parent, o.label) });
  }

  return json({ error: "not found" }, 404);
}
