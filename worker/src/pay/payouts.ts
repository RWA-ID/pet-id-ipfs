/**
 * Paying pet shops their referral commissions, through Stripe Connect.
 *
 * A shop connects a bank from its /shops/ dashboard: we create a US recipient
 * account (Accounts v2, Express dashboard) and send the shop to Stripe's hosted onboarding, which collects the
 * bank, the identity checks and the tax details. We never see any of it.
 *
 * runPayouts() runs daily at 15:00 UTC. Every day it finishes any transfer
 * Stripe refused earlier (usually an empty balance); on the 1st of the month
 * it also sends every connected shop one new transfer:
 *
 *   credits  orders that earn (EARNING_STATUSES), are older than the hold, and
 *            haven't been paid out          → orders.payout_id = this payout
 *   debits   orders that WERE paid out and have since been refunded or revoked
 *                                          → orders.clawback_payout_id = this payout
 *   amount = credits − debits, sent only if ≥ SHOP_PAYOUT_MIN_CENTS;
 *            otherwise nothing is marked and it all rolls over to next month.
 *
 * The marks are written in one D1 batch before Stripe is called, and the
 * transfer's idempotency key is the payout id. A crash anywhere leaves a
 * `pending` payout that the next run (or POST /admin/payouts/<id>/retry)
 * finishes, and can never send the same money twice.
 */
import {
  acquireLease, EARNING_STATUSES, getPartnerByUser, releaseLease, shouldAlert, sqlList,
  type PartnerRow, type PayoutRow,
} from "./db";
import { alertAdmin, emailShopConnectBank, emailShopPaid } from "./email";
import type { Env } from "./env";
import type { Session } from "./session";
import {
  createConnectedAccount, createDashboardLink, createOnboardingLink, createTransfer, getConnectedAccount,
  transfersStatus,
} from "./stripe";
import { allowedOrigins, json, readJson, short } from "./util";

type Cors = Record<string, string>;

/** Must equal the second cron in wrangler.pay.toml. Daily: retries; new payouts only on the 1st. */
export const PAYOUT_CRON = "0 15 * * *";

/** Whether a run at `at` creates this month's payouts, or only retries refused ones. */
export const isPayday = (at: number) => new Date(at).getUTCDate() === 1;
/** A failing transfer stops being retried automatically after this many attempts; admin can still retry. */
const MAX_TRANSFER_ATTEMPTS = 5;

const DAY = 24 * 3600_000;
const holdMs = (env: Env) => Number(env.SHOP_PAYOUT_HOLD_DAYS) * DAY;
const minCents = (env: Env) => Number(env.SHOP_PAYOUT_MIN_CENTS);
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const EARNING = sqlList(EARNING_STATUSES);
/** Orders that count toward the next payout, given a partner code and a cutoff. */
const CREDIT_WHERE = `partner_code = ? AND payout_id IS NULL AND status IN (${EARNING}) AND created_at < ? AND commission_cents > 0`;
/** Orders paid out earlier that have since stopped earning. */
const DEBIT_WHERE = `partner_code = ? AND payout_id IS NOT NULL AND clawback_payout_id IS NULL AND status NOT IN (${EARNING})`;

/** The 1st of next month at 15:00 UTC: when PAYOUT_CRON fires next. */
export function nextPayoutAt(now = Date.now()): number {
  const d = new Date(now);
  const thisMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 15);
  return now < thisMonth ? thisMonth : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 15);
}

// ─── Status ───────────────────────────────────────────────────────────────────

/**
 * Re-read the shop's Stripe account and store whether it can receive transfers.
 * Returns the fresh row. Never throws: a Stripe hiccup must not break the
 * dashboard, it just shows the last known state.
 */
export async function refreshConnectStatus(env: Env, p: PartnerRow): Promise<PartnerRow> {
  if (!p.stripe_account_id) return p;
  try {
    const a = await getConnectedAccount(env, p.stripe_account_id);
    const enabled = transfersStatus(a) === "active" ? 1 : 0;
    if (enabled !== p.payouts_enabled) {
      await env.DB.prepare("UPDATE partners SET payouts_enabled = ?, updated_at = ? WHERE code = ?")
        .bind(enabled, Date.now(), p.code).run();
    }
    return { ...p, payouts_enabled: enabled };
  } catch (e) {
    console.error("connect status", p.code, short(e));
    return p;
  }
}

/** What the shop's dashboard shows about getting paid. */
export async function payoutSummary(env: Env, p: PartnerRow) {
  const cutoff = Date.now() - holdMs(env);
  const [ready, holding, debits, paid, history] = await env.DB.batch<Record<string, number> | PayoutRow>([
    env.DB.prepare(`SELECT COALESCE(SUM(commission_cents), 0) AS c FROM orders WHERE ${CREDIT_WHERE}`).bind(p.code, cutoff),
    env.DB.prepare(
      `SELECT COALESCE(SUM(commission_cents), 0) AS c FROM orders
       WHERE partner_code = ? AND payout_id IS NULL AND status IN (${EARNING}) AND created_at >= ?`,
    ).bind(p.code, cutoff),
    env.DB.prepare(`SELECT COALESCE(SUM(commission_cents), 0) AS c FROM orders WHERE ${DEBIT_WHERE}`).bind(p.code),
    env.DB.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS c FROM payouts WHERE partner_code = ? AND status = 'paid'").bind(p.code),
    env.DB.prepare("SELECT * FROM payouts WHERE partner_code = ? ORDER BY created_at DESC LIMIT 12").bind(p.code),
  ]);
  const sum = (r: D1Result<unknown>) => Number((r.results[0] as { c?: number })?.c ?? 0);
  return {
    // Past the hold and owed, net of anything clawed back.
    readyCents: Math.max(0, sum(ready) - sum(debits)),
    // Earned, still inside the refund hold.
    holdingCents: sum(holding),
    paidCents: sum(paid),
    minCents: minCents(env),
    holdDays: Number(env.SHOP_PAYOUT_HOLD_DAYS),
    nextPayoutAt: nextPayoutAt(),
    history: (history.results as PayoutRow[]).map((x) => ({
      at: x.created_at,
      amountCents: x.amount_cents,
      orders: x.orders_count,
      // A failed transfer is retried; to the shop it's simply on its way.
      state: x.status === "paid" ? "paid" : "sending",
    })),
  };
}

// ─── Connecting a bank ────────────────────────────────────────────────────────

/** Where Stripe sends the shop back: our own /shops/ page, on a host we serve from. */
function backTo(raw: unknown, env: Env): string | null {
  try {
    const u = new URL(String(raw ?? ""));
    return allowedOrigins(env).includes(u.origin) ? `${u.origin}${u.pathname}` : null;
  } catch {
    return null;
  }
}

/**
 * POST /shop/payouts/connect { returnUrl }: create the shop's Express account
 * if it has none, and return a fresh onboarding link. The same call resumes an
 * onboarding the shop abandoned halfway.
 */
export async function handleConnect(req: Request, env: Env, user: Session, cors: Cors) {
  const p = await getPartnerByUser(env, user.sub);
  if (!p) return json({ error: "Sign up your shop first." }, 404, cors);
  const back = backTo((await readJson(req))?.returnUrl, env);
  if (!back) return json({ error: "invalid return URL" }, 400, cors);

  let account = p.stripe_account_id;
  if (!account) {
    try {
      account = (await createConnectedAccount(env, { partnerCode: p.code, email: p.email, businessName: p.business_name })).id;
    } catch (e) {
      console.error("connect account", p.code, short(e));
      if (await shouldAlert(env, "connect-failing", 6 * 3600_000)) {
        await alertAdmin(env, "Shops can't connect a bank", `Creating a Stripe Express account for ${p.code} failed:\n${short(e)}\n\nIs Connect enabled at https://dashboard.stripe.com/connect ?`);
      }
      return json({ error: "Bank setup isn't available right now. We've been notified. Please try again later." }, 502, cors);
    }
    // Only if still unset: a second tab racing this one keeps the first account.
    await env.DB.prepare("UPDATE partners SET stripe_account_id = ?, updated_at = ? WHERE code = ? AND stripe_account_id IS NULL")
      .bind(account, Date.now(), p.code).run();
    account = (await getPartnerByUser(env, user.sub))!.stripe_account_id!;
  }

  try {
    const link = await createOnboardingLink(env, account, `${back}?connect=done`, `${back}?connect=retry`);
    return json({ url: link.url }, 200, cors);
  } catch (e) {
    console.error("onboarding link", p.code, short(e));
    return json({ error: "Stripe couldn't open bank setup. Please try again." }, 502, cors);
  }
}

/** POST /shop/payouts/dashboard: a one-time link to the shop's own Stripe dashboard. */
export async function handleDashboardLink(env: Env, user: Session, cors: Cors) {
  const p = await getPartnerByUser(env, user.sub);
  if (!p?.stripe_account_id) return json({ error: "Connect your bank first." }, 409, cors);
  try {
    return json({ url: (await createDashboardLink(env, p.stripe_account_id)).url }, 200, cors);
  } catch (e) {
    console.error("dashboard link", p.code, short(e));
    return json({ error: "Stripe couldn't open your payouts page. Please try again." }, 502, cors);
  }
}

// ─── The monthly run ──────────────────────────────────────────────────────────

export interface RunReport {
  paid: { code: string; cents: number }[];
  failed: { code: string; error: string }[];
  rolledOver: string[];
  remindedToConnect: string[];
}

/**
 * @param createNew false on the daily retry run: only finish what earlier runs started.
 */
export async function runPayouts(env: Env, { createNew }: { createNew: boolean }): Promise<RunReport | null> {
  const holder = crypto.randomUUID();
  // Long enough for a few hundred shops; released as soon as the run ends.
  if (!(await acquireLease(env, "payouts", holder, 15 * 60_000))) return null;
  const report: RunReport = { paid: [], failed: [], rolledOver: [], remindedToConnect: [] };
  try {
    // 1. Anything an earlier run recorded but didn't get through.
    const { results: unfinished } = await env.DB.prepare(
      "SELECT * FROM payouts WHERE status IN ('pending', 'failed') AND attempts < ? ORDER BY created_at",
    ).bind(MAX_TRANSFER_ATTEMPTS).all<PayoutRow>();
    for (const x of unfinished) await sendTransfer(env, x, report);

    // 2. This month's.
    if (!createNew) return report;
    const cutoff = Date.now() - holdMs(env);
    const { results: shops } = await env.DB.prepare("SELECT * FROM partners ORDER BY created_at").all<PartnerRow>();
    for (const shop of shops) {
      try {
        await payShop(env, shop, cutoff, report);
      } catch (e) {
        report.failed.push({ code: shop.code, error: short(e) });
      }
    }
  } finally {
    await releaseLease(env, "payouts", holder);
  }

  if (report.paid.length || report.failed.length) {
    const total = report.paid.reduce((n, x) => n + x.cents, 0);
    await alertAdmin(env, `Shop payouts: ${report.paid.length} paid (${money(total)}), ${report.failed.length} failed`, [
      ...report.paid.map((x) => `paid    ${x.code}  ${money(x.cents)}`),
      ...report.failed.map((x) => `FAILED  ${x.code}  ${x.error}`),
      "",
      report.failed.length ? "Failed transfers retry on the next run, or POST /admin/payouts/<id>/retry." : "",
      `Rolled over (under ${money(minCents(env))}): ${report.rolledOver.length}. Reminded to connect a bank: ${report.remindedToConnect.length}.`,
    ].join("\n"));
  }
  return report;
}

async function payShop(env: Env, shop: PartnerRow, cutoff: number, report: RunReport) {
  // Cheap check first, so a shop under the minimum costs nothing and marks nothing.
  const [credit, debit] = await env.DB.batch<{ c: number }>([
    env.DB.prepare(`SELECT COALESCE(SUM(commission_cents), 0) AS c FROM orders WHERE ${CREDIT_WHERE}`).bind(shop.code, cutoff),
    env.DB.prepare(`SELECT COALESCE(SUM(commission_cents), 0) AS c FROM orders WHERE ${DEBIT_WHERE}`).bind(shop.code),
  ]);
  const owed = (credit.results[0]?.c ?? 0) - (debit.results[0]?.c ?? 0);
  if (owed <= 0) return;
  if (owed < minCents(env)) { report.rolledOver.push(shop.code); return; }

  const p = await refreshConnectStatus(env, shop);
  if (!p.payouts_enabled) {
    // Earned enough to be paid, and has nowhere to receive it.
    if (await shouldAlert(env, `connect-reminder:${p.code}`, 20 * DAY)) {
      const failure = await emailShopConnectBank(env, p, owed);
      if (!failure) report.remindedToConnect.push(p.code);
    }
    return;
  }

  // Mark the orders, then total exactly what was marked. One batch, so it all
  // lands or none of it does; the lease keeps any other run out meanwhile.
  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO payouts (id, partner_code, stripe_account_id, amount_cents, credit_cents, debit_cents, orders_count, status, created_at, updated_at)
       VALUES (?, ?, ?, 0, 0, 0, 0, 'pending', ?, ?)`,
    ).bind(id, p.code, p.stripe_account_id, now, now),
    env.DB.prepare(`UPDATE orders SET payout_id = ? WHERE ${CREDIT_WHERE}`).bind(id, p.code, cutoff),
    env.DB.prepare(`UPDATE orders SET clawback_payout_id = ? WHERE ${DEBIT_WHERE}`).bind(id, p.code),
    env.DB.prepare(
      `UPDATE payouts SET
         credit_cents = (SELECT COALESCE(SUM(commission_cents), 0) FROM orders WHERE payout_id = ?1),
         debit_cents  = (SELECT COALESCE(SUM(commission_cents), 0) FROM orders WHERE clawback_payout_id = ?1),
         orders_count = (SELECT COUNT(*) FROM orders WHERE payout_id = ?1)
       WHERE id = ?1`,
    ).bind(id),
    env.DB.prepare("UPDATE payouts SET amount_cents = credit_cents - debit_cents WHERE id = ?").bind(id),
  ]);

  const row = await env.DB.prepare("SELECT * FROM payouts WHERE id = ?").bind(id).first<PayoutRow>();
  if (!row || row.amount_cents <= 0) {
    // An order changed between the check and the batch, enough to wipe the
    // amount out. Undo the marks; it all rolls over.
    await env.DB.batch([
      env.DB.prepare("UPDATE orders SET payout_id = NULL WHERE payout_id = ?").bind(id),
      env.DB.prepare("UPDATE orders SET clawback_payout_id = NULL WHERE clawback_payout_id = ?").bind(id),
      env.DB.prepare("DELETE FROM payouts WHERE id = ?").bind(id),
    ]);
    report.rolledOver.push(p.code);
    return;
  }
  await sendTransfer(env, row, report, p);
}

async function sendTransfer(env: Env, x: PayoutRow, report: RunReport, shop?: PartnerRow) {
  try {
    const t = await createTransfer(env, {
      payoutId: x.id, partnerCode: x.partner_code, account: x.stripe_account_id, amountCents: x.amount_cents,
      description: `PetID referrals: ${x.orders_count} registration${x.orders_count === 1 ? "" : "s"}`,
    });
    await env.DB.prepare(
      "UPDATE payouts SET status = 'paid', stripe_transfer_id = ?, error = NULL, attempts = attempts + 1, updated_at = ? WHERE id = ?",
    ).bind(t.id, Date.now(), x.id).run();
    report.paid.push({ code: x.partner_code, cents: x.amount_cents });
    const p = shop ?? (await env.DB.prepare("SELECT * FROM partners WHERE code = ?").bind(x.partner_code).first<PartnerRow>());
    if (p) await emailShopPaid(env, p, x);
  } catch (e) {
    await env.DB.prepare(
      "UPDATE payouts SET status = 'failed', error = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?",
    ).bind(short(e), Date.now(), x.id).run();
    report.failed.push({ code: x.partner_code, error: short(e) });
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/** GET /admin/payouts, POST /admin/payouts/run, POST /admin/payouts/<id>/retry. Auth is checked by the caller. */
export async function handleAdminPayouts(req: Request, env: Env, url: URL): Promise<Response | null> {
  if (req.method === "GET" && url.pathname === "/admin/payouts") {
    const { results } = await env.DB.prepare("SELECT * FROM payouts ORDER BY created_at DESC LIMIT 200").all<PayoutRow>();
    return json({ payouts: results });
  }
  if (req.method === "POST" && url.pathname === "/admin/payouts/run") {
    const report = await runPayouts(env, { createNew: true });
    return report ? json({ report }) : json({ error: "a payout run is already in progress" }, 409);
  }
  const m = url.pathname.match(/^\/admin\/payouts\/([0-9a-f-]{36})\/retry$/);
  if (req.method === "POST" && m) {
    const x = await env.DB.prepare("SELECT * FROM payouts WHERE id = ? AND status IN ('pending', 'failed')").bind(m[1]).first<PayoutRow>();
    if (!x) return json({ error: "no unfinished payout with that id" }, 404);
    const report: RunReport = { paid: [], failed: [], rolledOver: [], remindedToConnect: [] };
    await sendTransfer(env, x, report);
    return json({ ok: report.paid.length === 1, error: report.failed[0]?.error });
  }
  return null;
}
