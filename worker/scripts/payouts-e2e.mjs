#!/usr/bin/env node
/**
 * End-to-end test of pet-shop payouts. No Stripe account, no chain:
 *
 *   - wrangler dev runs the worker locally against a fresh local D1.
 *   - A local HTTP server stands in for Stripe (STRIPE_API_BASE) and Resend
 *     (RESEND_API_BASE). It records every account, link, transfer and email
 *     the worker asks for, honours idempotency keys the way Stripe does, and
 *     can be told to refuse a transfer.
 *   - Orders are written straight into D1 with the statuses and ages each case
 *     needs; how an order gets minted is pay-e2e.mjs's job, not this one's.
 *
 * The properties that matter most: a shop is never paid twice for an order,
 * a refunded order that was already paid is taken back exactly once, and a
 * refused transfer is retried under the same idempotency key.
 *
 * Run from worker/:  node scripts/payouts-e2e.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { rmSync, writeFileSync, existsSync, unlinkSync } from "node:fs";

const WORKER_PORT = 8795;
const MOCK_PORT = 8794;
const BASE = `http://127.0.0.1:${WORKER_PORT}`;
const PERSIST = ".wrangler/payouts-e2e";
const SITE = "http://localhost:3000/shops/";
const PAYOUT_CRON = "0 15 * * *";

const SESSION_SECRET = `e2e-${randomUUID()}`;
const ADMIN_TOKEN = `admin-${randomUUID()}`;
const DAY = 24 * 3600_000;

const children = [];
let failures = 0;

function check(ok, what) {
  console.log(`  ${ok ? "✔" : "✘"} ${what}`);
  if (!ok) failures++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, what, timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${what} (last: ${last?.message ?? JSON.stringify(last)})`);
}

async function fetchRetry(url, init) {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      if (i >= 30) throw e;
      await sleep(1000);
    }
  }
}

async function api(path, { token, method = "GET", body, admin } = {}) {
  const auth = admin ? `Bearer ${ADMIN_TOKEN}` : token ? `Bearer ${token}` : undefined;
  const res = await fetchRetry(`${BASE}${path}`, {
    method,
    headers: { ...(auth ? { Authorization: auth } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const d1Args = ["wrangler", "d1", "execute", "petid-orders", "--local", "--persist-to", PERSIST, "-c", "wrangler.pay.toml"];
const d1 = (sql) => execFileSync("npx", [...d1Args, "--command", sql], { stdio: "pipe" });
function d1Read(sql) {
  const out = execFileSync("npx", [...d1Args, "--json", "--command", sql], { stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

function sessionFor(sub, email) {
  const payload = Buffer.from(JSON.stringify({ sub, email, name: "E2E", exp: Date.now() + 3600_000 })).toString("base64url");
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

// ─── The stand-in for Stripe and Resend ───────────────────────────────────────

const stripe = {
  accounts: new Map(),      // id → { params, payouts_enabled }
  transfers: [],            // successful transfers
  attempts: [],             // every POST /v1/transfers, refused or not
  idem: new Map(),          // idempotency key → response body
  refuseTo: new Set(),      // destinations whose transfers fail
  links: 0,
  loginLinks: 0,
};
const mailbox = [];

function startMock() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const send = (status, body) => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(body));
        };
        const url = new URL(req.url, "http://x");
        if (url.pathname === "/emails") {
          const b = JSON.parse(raw || "{}");
          mailbox.push({ to: b.to?.[0], subject: b.subject ?? "", text: b.text ?? "" });
          return send(200, { id: `mail-${randomUUID()}` });
        }
        if (req.headers.authorization !== "Bearer sk_test_payouts_e2e") return send(401, { error: { message: "bad key" } });
        const params = Object.fromEntries(new URLSearchParams(raw));
        const key = req.headers["idempotency-key"];
        if (key && stripe.idem.has(key)) return send(200, stripe.idem.get(key));
        const remember = (body) => { if (key) stripe.idem.set(key, body); return send(200, body); };
        const account = (id) => {
          const a = stripe.accounts.get(id);
          return { id, payouts_enabled: a.payouts_enabled, details_submitted: a.payouts_enabled,
            capabilities: { transfers: a.payouts_enabled ? "active" : "inactive" } };
        };

        let m;
        if (req.method === "POST" && url.pathname === "/v1/accounts") {
          const id = `acct_mock${stripe.accounts.size + 1}`;
          stripe.accounts.set(id, { params, payouts_enabled: false });
          return remember(account(id));
        }
        if ((m = url.pathname.match(/^\/v1\/accounts\/(acct_\w+)$/)) && req.method === "GET") {
          return stripe.accounts.has(m[1]) ? send(200, account(m[1])) : send(404, { error: { message: "no such account" } });
        }
        if ((m = url.pathname.match(/^\/v1\/accounts\/(acct_\w+)\/login_links$/)) && req.method === "POST") {
          stripe.loginLinks++;
          return send(200, { url: `https://connect.stripe.test/express/${m[1]}` });
        }
        if (req.method === "POST" && url.pathname === "/v1/account_links") {
          stripe.links++;
          stripe.lastLink = params;
          return send(200, { url: `https://connect.stripe.test/setup/${params.account}` });
        }
        if (req.method === "POST" && url.pathname === "/v1/transfers") {
          stripe.attempts.push({ ...params, key });
          // A refusal is not cached, as with Stripe's errors that can be retried.
          if (stripe.refuseTo.has(params.destination)) {
            return send(400, { error: { code: "balance_insufficient", message: "Insufficient funds in Stripe account." } });
          }
          const t = { id: `tr_mock${stripe.transfers.length + 1}`, ...params, key };
          stripe.transfers.push(t);
          return remember({ id: t.id });
        }
        send(404, { error: { message: `mock has no ${req.method} ${url.pathname}` } });
      });
    });
    srv.listen(MOCK_PORT, "127.0.0.1", () => resolve(srv));
  });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** A user plus a signed-up shop. */
async function shop(code) {
  const sub = `e2e-${code}`;
  const email = `${code}@example.com`;
  d1(`INSERT INTO users (sub, email, created_at, last_login) VALUES ('${sub}', '${email}', 0, 0)`);
  const token = sessionFor(sub, email);
  const r = await api("/shop", { token, method: "POST", body: { code, businessName: `Shop ${code}`, contactName: "Ana", address: "1 Main St, Miami FL" } });
  if (r.status !== 200) throw new Error(`sign-up ${code}: ${r.body?.error}`);
  return { code, sub, email, token };
}

/** Credited orders for `code`, `ageDays` old, in `status`. One d1 call for all of them. */
let orderSeq = 0;
function orders(code, n, status, ageDays) {
  const at = Date.now() - ageDays * DAY;
  const rows = Array.from({ length: n }, () => {
    const id = randomUUID();
    const label = `e2e-${code}-${++orderSeq}`;
    return `('${id}', 'e2e-buyer', 'buyer@example.com', 'dogid.eth', '${label}', '0xe301aa', 1999, '${status}', '${code}', 500, ${at}, ${at})`;
  });
  d1(`INSERT INTO orders (id, user_sub, email, parent, label, contenthash, amount_cents, status, partner_code, commission_cents, created_at, updated_at)
      VALUES ${rows.join(", ")}`);
}

const run = () => api("/admin/payouts/run", { method: "POST", admin: true });
const transfersTo = (acct) => stripe.transfers.filter((t) => t.destination === acct);
const mailTo = (addr) => mailbox.filter((m) => m.to === addr);

function cleanup() {
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGKILL");
    } catch {}
  }
  try {
    if (existsSync(".dev.vars")) unlinkSync(".dev.vars");
  } catch {}
}

async function main() {
  const mock = await startMock();
  rmSync(PERSIST, { recursive: true, force: true });
  if (existsSync(".dev.vars")) throw new Error("worker/.dev.vars already exists; move it aside first");
  writeFileSync(".dev.vars", [
    `SESSION_SECRET=${SESSION_SECRET}`,
    `ADMIN_TOKEN=${ADMIN_TOKEN}`,
    "STRIPE_SECRET_KEY=sk_test_payouts_e2e",
    `STRIPE_API_BASE=http://127.0.0.1:${MOCK_PORT}`,
    "STRIPE_WEBHOOK_SECRET=whsec_e2e_unused",
    "RPC_URL=http://127.0.0.1:1", // never reached: nothing here touches the chain
    `FULFILLER_PRIVATE_KEY=0x${randomBytes(32).toString("hex")}`,
    "RESEND_API_KEY=re_e2e_mock",
    `RESEND_API_BASE=http://127.0.0.1:${MOCK_PORT}`,
  ].join("\n"));

  console.log("Applying migrations to a fresh local D1…");
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "petid-orders", "--local", "--persist-to", PERSIST,
    "-c", "wrangler.pay.toml"], { stdio: "pipe", env: { ...process.env, CI: "1" } });

  console.log("Starting wrangler dev…");
  children.push(spawn("npx", ["wrangler", "dev", "-c", "wrangler.pay.toml", "--local", "--port", String(WORKER_PORT),
    "--persist-to", PERSIST, "--test-scheduled"], { stdio: ["ignore", "ignore", "inherit"], detached: true }));
  await until(async () => (await fetch(`${BASE}/health`)).ok, "wrangler dev", 300_000);

  d1("INSERT INTO users (sub, email, created_at, last_login) VALUES ('e2e-buyer', 'buyer@example.com', 0, 0)");
  const a = await shop("alpha");   // connected, earns enough
  const b = await shop("bravo");   // earns enough, never connects
  const c = await shop("charlie"); // connected, under the minimum
  const d = await shop("delta");   // connected, Stripe refuses the first transfer

  // ── Connecting a bank ───────────────────────────────────────────────────
  console.log("\nConnecting a bank");
  const fresh = await api("/shop", { token: a.token });
  check(fresh.body?.shop?.payouts === "none", "a new shop starts with no bank");
  check(fresh.body?.payouts?.minCents === 2000 && fresh.body?.payouts?.holdDays === 30, "minimum $20, 30-day hold");
  check((await api("/shop/payouts/connect", { method: "POST", body: { returnUrl: SITE } })).status === 401, "connect needs a session");
  check((await api("/shop/payouts/connect", { token: a.token, method: "POST", body: { returnUrl: "https://evil.example/shops/" } })).status === 400,
    "connect refuses a return URL on someone else's site");
  const noShop = sessionFor("e2e-buyer", "buyer@example.com");
  check((await api("/shop/payouts/connect", { token: noShop, method: "POST", body: { returnUrl: SITE } })).status === 404,
    "an account with no shop can't connect");

  const link = await api("/shop/payouts/connect", { token: a.token, method: "POST", body: { returnUrl: `${SITE}?connect=done` } });
  check(link.status === 200 && /connect\.stripe\.test\/setup\/acct_mock1$/.test(link.body?.url ?? ""), `connect → Stripe onboarding link (${link.body?.url ?? link.body?.error})`);
  const created = stripe.accounts.get("acct_mock1")?.params ?? {};
  check(created.type === "express" && created.country === "US", "creates a US Express account");
  check(created["capabilities[transfers][requested]"] === "true" && !("capabilities[card_payments][requested]" in created), "asks for transfers only");
  check(created.email === a.email && created["metadata[partner_code]"] === "alpha", "account carries the shop's email and code");
  check(stripe.lastLink?.return_url === `${SITE}?connect=done` && stripe.lastLink?.refresh_url === `${SITE}?connect=retry`,
    "Stripe returns the shop to /shops/ (query stripped, then ?connect=done|retry)");

  await api("/shop/payouts/connect", { token: a.token, method: "POST", body: { returnUrl: SITE } });
  check(stripe.accounts.size === 1 && stripe.links === 2, "connecting again resumes the same account with a fresh link");
  check((await api("/shop", { token: a.token })).body?.shop?.payouts === "incomplete", "onboarding not finished → incomplete");

  stripe.accounts.get("acct_mock1").payouts_enabled = true;
  check((await api("/shop", { token: a.token })).body?.shop?.payouts === "active", "Stripe enables payouts → active on the next dashboard load");
  const dash = await api("/shop/payouts/dashboard", { token: a.token, method: "POST" });
  check(dash.status === 200 && /express\/acct_mock1$/.test(dash.body?.url ?? ""), "dashboard link opens the shop's Stripe Express page");
  check((await api("/shop/payouts/dashboard", { token: b.token, method: "POST" })).status === 409, "no dashboard link before connecting");

  for (const s of [c, d]) await api("/shop/payouts/connect", { token: s.token, method: "POST", body: { returnUrl: SITE } });
  const acct = { alpha: "acct_mock1", charlie: "acct_mock2", delta: "acct_mock3" };
  stripe.accounts.get(acct.charlie).payouts_enabled = true;
  stripe.accounts.get(acct.delta).payouts_enabled = true;

  // ── What's owed ─────────────────────────────────────────────────────────
  console.log("\nWhat's owed");
  orders("alpha", 5, "claimed", 40);      // $25 ready
  orders("alpha", 1, "minted", 5);        // $5 in the refund window
  orders("alpha", 1, "refunded", 40);     // never earned
  orders("alpha", 1, "paid", 40);         // not minted yet
  orders("bravo", 5, "minted", 40);       // $25 ready, no bank
  orders("charlie", 2, "minted", 40);     // $10, under the minimum
  orders("delta", 4, "minted", 40);       // $20, exactly the minimum

  const owed = (await api("/shop", { token: a.token })).body?.payouts;
  check(owed?.readyCents === 2500, `ready = only earning orders past the hold ($${owed?.readyCents / 100})`);
  check(owed?.holdingCents === 500, "a recent order waits out the refund window");
  check(owed?.paidCents === 0 && owed?.history?.length === 0, "nothing paid yet");
  const next = new Date(owed?.nextPayoutAt ?? 0);
  check(next.getUTCDate() === 1 && next.getUTCHours() === 15 && owed.nextPayoutAt > Date.now(), `next payout is the coming 1st, 15:00 UTC (${next.toISOString()})`);

  // ── The first run ───────────────────────────────────────────────────────
  console.log("\nFirst run");
  stripe.refuseTo.add(acct.delta);
  const r1 = await run();
  check(r1.status === 200, `run → 200 (${r1.body?.error ?? "ok"})`);
  check(transfersTo(acct.alpha).length === 1 && transfersTo(acct.alpha)[0].amount === "2500", "alpha is sent $25.00");
  const t1 = transfersTo(acct.alpha)[0] ?? {};
  check(t1.currency === "usd" && /^transfer-[0-9a-f-]{36}$/.test(t1.key ?? "") && t1["metadata[partner_code]"] === "alpha",
    "transfer is USD, keyed on the payout id, tagged with the shop");
  check(/5 registrations/.test(t1.description ?? ""), `transfer description counts the registrations (${t1.description})`);
  check(r1.body?.report?.remindedToConnect?.includes("bravo") && stripe.transfers.every((t) => !t["metadata[partner_code]"]?.includes("bravo")),
    "bravo has no bank: reminded, not paid");
  check(mailTo(b.email).some((m) => /\$25\.00/.test(m.subject) && /connect your bank/i.test(m.text)), "bravo's reminder names the amount and the fix");
  check(r1.body?.report?.rolledOver?.includes("charlie") && transfersTo(acct.charlie).length === 0, "charlie's $10 rolls over");
  check(transfersTo(acct.delta).length === 0 && r1.body?.report?.failed?.some((f) => f.code === "delta"), "delta's transfer is refused and reported");
  check(mailTo(a.email).some((m) => /\$25\.00/.test(m.subject)), "alpha is emailed the payout");
  check(mailbox.some((m) => m.to === "petid@onchain-id.id" && /1 paid.*1 failed/.test(m.subject)), "admin gets the run summary");

  const [marks] = d1Read(`SELECT
      SUM(CASE WHEN payout_id IS NOT NULL THEN 1 ELSE 0 END) AS paid_out,
      SUM(CASE WHEN payout_id IS NULL AND status = 'minted' THEN 1 ELSE 0 END) AS waiting
    FROM orders WHERE partner_code = 'alpha'`);
  check(marks.paid_out === 5 && marks.waiting === 1, `exactly the 5 old earning orders are marked paid (${JSON.stringify(marks)})`);
  const [dRow] = d1Read("SELECT status, attempts, amount_cents FROM payouts WHERE partner_code = 'delta'");
  check(dRow?.status === "failed" && dRow.attempts === 1 && dRow.amount_cents === 2000, "delta's payout is recorded as failed, $20.00, 1 attempt");

  const after = (await api("/shop", { token: a.token })).body?.payouts;
  check(after?.paidCents === 2500 && after?.readyCents === 0 && after?.history?.[0]?.state === "paid", "alpha's dashboard shows $25 paid, nothing ready");
  const dView = (await api("/shop", { token: d.token })).body?.payouts;
  check(dView?.history?.[0]?.state === "sending", "a refused transfer shows to the shop as still sending");

  // ── Running again ───────────────────────────────────────────────────────
  console.log("\nSecond run (nothing new)");
  stripe.refuseTo.delete(acct.delta);
  const mailsBefore = mailTo(b.email).length;
  await run();
  check(transfersTo(acct.alpha).length === 1, "alpha isn't paid twice for the same orders");
  check(transfersTo(acct.delta).length === 1 && transfersTo(acct.delta)[0].amount === "2000", "delta's failed payout is retried and lands");
  const deltaKeys = new Set(stripe.attempts.filter((t) => t.destination === acct.delta).map((t) => t.key));
  check(deltaKeys.size === 1, "the retry reuses the same idempotency key");
  check(d1Read("SELECT COUNT(*) AS n FROM payouts WHERE partner_code = 'delta'")[0].n === 1, "no second payout row for delta");
  check(mailTo(b.email).length === mailsBefore, "bravo isn't reminded again within 20 days");

  // ── Clawback ────────────────────────────────────────────────────────────
  console.log("\nRefund after payout");
  d1(`UPDATE orders SET status = 'refunded' WHERE rowid = (SELECT MIN(rowid) FROM orders WHERE partner_code = 'alpha' AND payout_id IS NOT NULL)`);
  check((await api("/shop", { token: a.token })).body?.payouts?.readyCents === 0, "a clawback alone never shows as negative");
  orders("alpha", 5, "minted", 35);      // +$25
  check((await api("/shop", { token: a.token })).body?.payouts?.readyCents === 2000, "ready = $25 new − $5 clawed back");
  await run();
  const t2 = transfersTo(acct.alpha)[1];
  check(t2?.amount === "2000", `next transfer nets the clawback ($${(t2?.amount ?? 0) / 100})`);
  const [p2] = d1Read("SELECT credit_cents, debit_cents, orders_count FROM payouts WHERE partner_code = 'alpha' ORDER BY created_at DESC LIMIT 1");
  check(p2?.credit_cents === 2500 && p2?.debit_cents === 500 && p2?.orders_count === 5, `payout records the split (${JSON.stringify(p2)})`);
  check(mailTo(a.email).some((m) => /less \$5\.00/.test(m.text)), "the payout email explains the deduction");
  await run();
  check(transfersTo(acct.alpha).length === 2, "the clawback is taken exactly once");

  // ── The daily schedule ──────────────────────────────────────────────────
  // It fires with today's date: a retry-only run, unless this test happens to
  // run on the 1st (UTC), when it also creates payouts.
  console.log("\nThe daily cron");
  const payday = new Date().getUTCDate() === 1;
  orders("charlie", 2, "minted", 40);     // charlie now has $20
  stripe.refuseTo.add(acct.charlie);
  await run();                            // admin run: charlie's payout is created, and refused
  check(transfersTo(acct.charlie).length === 0 && d1Read("SELECT status FROM payouts WHERE partner_code = 'charlie'")[0]?.status === "failed",
    "charlie's rolled-over $10 plus the new $10 makes a payout; Stripe refuses it");
  stripe.refuseTo.delete(acct.charlie);
  orders("alpha", 5, "minted", 40);       // alpha is owed $25 again
  const sched = await fetchRetry(`${BASE}/__scheduled?cron=${encodeURIComponent(PAYOUT_CRON)}`);
  check(sched.ok, "the payout cron fires");
  await until(() => transfersTo(acct.charlie).length === 1, "charlie's retried transfer", 30_000).catch(() => {});
  check(transfersTo(acct.charlie)[0]?.amount === "2000", "the daily run retries charlie's refused $20.00 and it lands");
  await sleep(2000);
  check(transfersTo(acct.alpha).length === (payday ? 3 : 2),
    payday ? "it's the 1st: the run also pays alpha's new $25" : "not the 1st: alpha's new $25 waits for payday");
  const before = stripe.attempts.length;
  await fetchRetry(`${BASE}/__scheduled?cron=${encodeURIComponent("* * * * *")}`);
  await sleep(2000);
  check(stripe.attempts.length === before, "the every-minute cron doesn't pay anyone");

  // ── Admin ───────────────────────────────────────────────────────────────
  console.log("\nAdmin");
  check((await api("/admin/payouts/run", { method: "POST" })).status === 401, "running payouts needs the admin token");
  const list = await api("/admin/payouts", { admin: true });
  const expected = payday ? 5 : 4;
  check(list.body?.payouts?.length === expected && list.body.payouts.every((x) => x.status === "paid"),
    `admin lists ${expected} payouts, all paid (${list.body?.payouts?.map((x) => x.status)})`);
  check((await api(`/admin/payouts/${list.body.payouts[0].id}/retry`, { method: "POST", admin: true })).status === 404,
    "a paid payout can't be retried");

  mock.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
}

main()
  .catch((e) => {
    console.error(e);
    failures++;
  })
  .finally(() => {
    cleanup();
    process.exit(failures ? 1 : 0);
  });
