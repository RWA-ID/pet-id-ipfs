/**
 * Pet-shop referrals for card orders.
 *
 * A shop signs up on the site's /shops/ page with the same sign-in a buyer
 * uses, picks a code, and prints a flyer whose QR opens the site with
 * ?ref=<code>. The site remembers the code and sends it with the checkout, and
 * handleCheckout stamps the order with the shop and its commission at that
 * moment. A customer who didn't scan can type the code on the review step.
 *
 * This file is attribution only. Paying shops (Stripe Connect) comes later and
 * reads the same rows: an order earns once it is minted, and stops earning if
 * it is refunded or revoked, because those move it out of EARNING_STATUSES.
 */
import {
  EARNING_STATUSES, ON_THE_WAY_STATUSES, publicPartner, sqlList, type OrderRow, type PartnerRow,
} from "./db";
import type { Env } from "./env";
import { payoutSummary, refreshConnectStatus } from "./payouts";
import { qrPng } from "./qr";
import type { Session } from "./session";
import { cleanText, json, normalizeShopCode, readJson } from "./util";

type Cors = Record<string, string>;

export const getPartner = (env: Env, code: string) =>
  env.DB.prepare("SELECT * FROM partners WHERE code = ?").bind(code).first<PartnerRow>();

/** Where a shop's flyer QR points. The site picks ?ref= up on any page. */
export const shopLink = (env: Env, code: string) => `${env.SITE_URL}/?ref=${code}`;

/**
 * The shop an order should be credited to, or null. Never fails a checkout:
 * an unknown, paused or self-referred code just means no shop earns.
 */
export async function referringShop(env: Env, rawRef: unknown, buyer: Session): Promise<PartnerRow | null> {
  const code = normalizeShopCode(rawRef);
  if (!code) return null;
  const p = await getPartner(env, code);
  if (!p || p.status !== "active") return null;
  // A shop buying through its own flyer doesn't earn on itself.
  if (p.user_sub === buyer.sub || p.email.toLowerCase() === buyer.email.toLowerCase()) return null;
  return p;
}

// ─── Public ───────────────────────────────────────────────────────────────────

/**
 * GET /shops/<code>: the shop's display name, so the review step can say
 * "Referred by Paws & Co" and a mistyped code is caught before paying.
 */
export async function handleShopLookup(env: Env, code: string, cors: Cors) {
  const p = await getPartner(env, code);
  if (!p || p.status !== "active") return json({ error: "We don't recognise that shop code." }, 404, cors);
  return json({ shop: { code: p.code, businessName: p.business_name } }, 200, cors);
}

/** GET /shops/<code>/qr.png: the flyer QR, printable and downloadable. */
export async function handleShopQr(req: Request, env: Env, code: string) {
  const p = await getPartner(env, code);
  if (!p) return json({ error: "not found" }, 404);
  // Bigger modules than the collar QR: this one is scanned off a counter from arm's length.
  const png = qrPng(shopLink(env, p.code), 12);
  return new Response(req.method === "HEAD" ? null : png, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.length),
      // A code never changes, so neither does its QR.
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="petid-${p.code}-qr.png"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ─── The signed-in shop ───────────────────────────────────────────────────────

async function shopStats(env: Env, code: string) {
  const totals = await env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN (${sqlList(EARNING_STATUSES)}) THEN 1 ELSE 0 END), 0) AS registrations,
       COALESCE(SUM(CASE WHEN status IN (${sqlList(EARNING_STATUSES)}) THEN commission_cents ELSE 0 END), 0) AS earned_cents,
       COALESCE(SUM(CASE WHEN status IN (${sqlList(ON_THE_WAY_STATUSES)}) THEN 1 ELSE 0 END), 0) AS on_the_way
     FROM orders WHERE partner_code = ?`,
  ).bind(code).first<{ registrations: number; earned_cents: number; on_the_way: number }>();

  // No customer details: a shop sees that a registration happened, not whose.
  const { results } = await env.DB.prepare(
    `SELECT status, commission_cents, created_at FROM orders
     WHERE partner_code = ? AND status IN (${sqlList([...EARNING_STATUSES, ...ON_THE_WAY_STATUSES])})
     ORDER BY created_at DESC LIMIT 25`,
  ).bind(code).all<Pick<OrderRow, "status" | "commission_cents" | "created_at">>();

  return {
    registrations: totals?.registrations ?? 0,
    earnedCents: totals?.earned_cents ?? 0,
    onTheWay: totals?.on_the_way ?? 0,
    recent: results.map((o) => ({
      at: o.created_at,
      commissionCents: o.commission_cents ?? 0,
      state: (EARNING_STATUSES as readonly string[]).includes(o.status) ? "earned" : "processing",
    })),
  };
}

/** GET /shop: this account's shop, its numbers and its payouts, or { shop: null } before sign-up. */
export async function handleGetMyShop(env: Env, user: Session, cors: Cors) {
  let p = await env.DB.prepare("SELECT * FROM partners WHERE user_sub = ?").bind(user.sub).first<PartnerRow>();
  if (!p) return json({ shop: null }, 200, cors);
  // Mid-onboarding, the shop lands back here from Stripe: ask Stripe how it went.
  if (p.stripe_account_id && !p.payouts_enabled) p = await refreshConnectStatus(env, p);
  return json({
    shop: publicPartner(p),
    link: shopLink(env, p.code),
    qrUrl: `${env.PUBLIC_URL}/shops/${p.code}/qr.png`,
    stats: await shopStats(env, p.code),
    payouts: await payoutSummary(env, p),
  }, 200, cors);
}

/**
 * POST /shop: sign up, or update the shop's details. The code is set once, at
 * sign-up, and ignored afterwards — flyers carrying it are already on counters.
 * The contact email is the signed-in address, which sign-in has already proven.
 */
export async function handleSaveMyShop(req: Request, env: Env, user: Session, cors: Cors) {
  const body = await readJson(req);
  const businessName = cleanText(body?.businessName, 60);
  const contactName = cleanText(body?.contactName, 60);
  const address = cleanText(body?.address, 160);
  const phone = cleanText(body?.phone, 40) || null;

  if (businessName.length < 2) return json({ error: "Enter your shop's name." }, 400, cors);
  if (contactName.length < 2) return json({ error: "Enter your name." }, 400, cors);
  if (address.length < 5) return json({ error: "Enter your shop's address." }, 400, cors);

  const now = Date.now();
  const existing = await env.DB.prepare("SELECT * FROM partners WHERE user_sub = ?").bind(user.sub).first<PartnerRow>();
  if (existing) {
    await env.DB.prepare(
      `UPDATE partners SET business_name = ?, contact_name = ?, address = ?, phone = ?, email = ?, updated_at = ?
       WHERE code = ?`,
    ).bind(businessName, contactName, address, phone, user.email, now, existing.code).run();
    return handleGetMyShop(env, user, cors);
  }

  const code = normalizeShopCode(body?.code);
  if (!code) {
    return json({ error: "Your shop code needs 3 to 24 letters or numbers. Hyphens are fine in the middle." }, 400, cors);
  }
  const commission = Number(env.SHOP_COMMISSION_CENTS);
  if (!Number.isInteger(commission) || commission < 0) throw new Error("SHOP_COMMISSION_CENTS is not a whole number of cents");

  try {
    await env.DB.prepare(
      `INSERT INTO partners (code, user_sub, business_name, contact_name, email, phone, address, commission_cents, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    ).bind(code, user.sub, businessName, contactName, user.email, phone, address, commission, now, now).run();
  } catch (e) {
    // PRIMARY KEY on code, UNIQUE on user_sub. A second tab racing this one
    // would hit user_sub; anyone else hits the code.
    if (String(e).includes("partners.user_sub")) return handleGetMyShop(env, user, cors);
    if (String(e).includes("UNIQUE")) {
      return json({ error: `The code ${code.toUpperCase()} is taken. Try adding your street or town, like ${code.toUpperCase()}-DOWNTOWN.` }, 409, cors);
    }
    throw e;
  }
  return handleGetMyShop(env, user, cors);
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/** GET /admin/shops, POST /admin/shops/<code>/(pause|activate). Auth is checked by the caller. */
export async function handleAdminShops(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (req.method === "GET" && url.pathname === "/admin/shops") {
    const { results } = await env.DB.prepare(
      `SELECT p.*,
         (SELECT COUNT(*) FROM orders o WHERE o.partner_code = p.code AND o.status IN (${sqlList(EARNING_STATUSES)})) AS registrations,
         (SELECT COALESCE(SUM(o.commission_cents), 0) FROM orders o WHERE o.partner_code = p.code AND o.status IN (${sqlList(EARNING_STATUSES)})) AS earned_cents
       FROM partners p ORDER BY p.created_at DESC LIMIT 500`,
    ).all();
    return json({ shops: results });
  }
  const m = url.pathname.match(/^\/admin\/shops\/([a-z0-9-]{3,24})\/(pause|activate)$/);
  if (req.method === "POST" && m) {
    const r = await env.DB.prepare("UPDATE partners SET status = ?, updated_at = ? WHERE code = ?")
      .bind(m[2] === "pause" ? "paused" : "active", Date.now(), m[1]).run();
    return r.meta.changes ? json({ ok: true }) : json({ error: "shop not found" }, 404);
  }
  return null;
}
