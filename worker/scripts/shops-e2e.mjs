#!/usr/bin/env node
/**
 * End-to-end test of pet-shop referrals: sign-up, the flyer QR, and checkout
 * attribution. No Stripe account and no chain writes:
 *
 *   - wrangler dev runs the worker locally against a fresh local D1.
 *   - The Stripe key is fake, so every checkout fails at the Stripe call. That
 *     is after the order row is written, which is the row this test reads: the
 *     shop and commission are stamped on it before Stripe is ever asked.
 *   - Checkout does read the chain (is the name free?), so it needs an RPC.
 *     A public one is fine for a handful of calls.
 *
 * Run from worker/:  node scripts/shops-e2e.mjs   [RPC_URL=<mainnet rpc>]
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { rmSync, writeFileSync, existsSync, unlinkSync } from "node:fs";

const WORKER_PORT = 8796;
const BASE = `http://127.0.0.1:${WORKER_PORT}`;
const PERSIST = ".wrangler/shops-e2e";
const RPC_URL = process.env.RPC_URL ?? "https://ethereum-rpc.publicnode.com";

const SESSION_SECRET = `e2e-${randomUUID()}`;
const ADMIN_TOKEN = `admin-${randomUUID()}`;

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

function d1(sql) {
  execFileSync("npx", [...d1Args, "--command", sql], { stdio: "pipe" });
}

function d1Read(sql) {
  const out = execFileSync("npx", [...d1Args, "--json", "--command", sql], { stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

function sessionFor(sub, email) {
  const payload = Buffer.from(JSON.stringify({ sub, email, name: "E2E", exp: Date.now() + 3600_000 })).toString("base64url");
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** An account row plus a session for it. Orders and shops reference users(sub). */
function account(tag) {
  const sub = `e2e-${tag}-${randomUUID().slice(0, 8)}`;
  const email = `${sub}@example.com`;
  d1(`INSERT INTO users (sub, email, created_at, last_login) VALUES ('${sub}', '${email}', 0, 0)`);
  return { sub, email, token: sessionFor(sub, email) };
}

/** Open a checkout with `ref` and return the order row it wrote. */
async function checkoutWith(user, ref) {
  // Random and long, so it's free on mainnet.
  const label = `e2e-shop-${randomBytes(6).toString("hex")}`;
  const r = await api("/checkout", {
    token: user.token, method: "POST",
    body: { parent: "dogid.eth", label, contenthash: `0xe301${"ab".repeat(20)}`, returnUrl: "http://localhost:3000/register/", ref },
  });
  // `d1 --json` prints NULL as the string "null", so NULL-ness is asked in SQL.
  const [row] = d1Read(
    `SELECT partner_code, commission_cents, status, partner_code IS NULL AND commission_cents IS NULL AS no_shop
     FROM orders WHERE label = '${label}'`,
  );
  return { status: r.status, error: r.body?.error, row };
}

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
  rmSync(PERSIST, { recursive: true, force: true });
  if (existsSync(".dev.vars")) throw new Error("worker/.dev.vars already exists; move it aside first");
  writeFileSync(".dev.vars", [
    `SESSION_SECRET=${SESSION_SECRET}`,
    `ADMIN_TOKEN=${ADMIN_TOKEN}`,
    "STRIPE_SECRET_KEY=sk_test_e2e_fake",
    "STRIPE_WEBHOOK_SECRET=whsec_e2e_unused",
    `RPC_URL=${RPC_URL}`,
    // Random, never a well-known dev key — see pay-e2e.mjs. Nothing here signs.
    `FULFILLER_PRIVATE_KEY=0x${randomBytes(32).toString("hex")}`,
  ].join("\n"));

  console.log("Applying migrations to a fresh local D1…");
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "petid-orders", "--local", "--persist-to", PERSIST,
    "-c", "wrangler.pay.toml"], { stdio: "pipe", env: { ...process.env, CI: "1" } });

  console.log("Starting wrangler dev…");
  children.push(spawn("npx", ["wrangler", "dev", "-c", "wrangler.pay.toml", "--local", "--port", String(WORKER_PORT),
    "--persist-to", PERSIST], { stdio: ["ignore", "ignore", "inherit"], detached: true }));
  await until(async () => (await fetch(`${BASE}/health`)).ok, "wrangler dev", 300_000);

  const owner = account("owner");
  const rival = account("rival");
  const buyer = account("buyer");

  // ── Sign-up ─────────────────────────────────────────────────────────────
  console.log("\nSign-up");
  check((await api("/shop")).status === 401, "GET /shop needs a session");
  const before = await api("/shop", { token: owner.token });
  check(before.status === 200 && before.body?.shop === null, "an account with no shop gets { shop: null }");

  const form = { businessName: "Paws & Co", contactName: "Ana Reyes", address: "12 Main St, Miami FL", phone: "+1 305 000 0000" };
  for (const bad of ["ab", "-paws", "paws-", "pa--ws", "paws co", "x".repeat(25), "pawś"]) {
    const r = await api("/shop", { token: owner.token, method: "POST", body: { ...form, code: bad } });
    check(r.status === 400, `rejects code ${JSON.stringify(bad)}`);
  }
  check((await api("/shop", { token: owner.token, method: "POST", body: { ...form, businessName: "", code: "pawsco" } })).status === 400,
    "rejects a missing shop name");
  check((await api("/shop", { token: owner.token, method: "POST", body: { ...form, address: "", code: "pawsco" } })).status === 400,
    "rejects a missing address");

  const created = await api("/shop", { token: owner.token, method: "POST", body: { ...form, code: " PawsCo " } });
  check(created.status === 200, `sign-up → 200 (${created.body?.error ?? "ok"})`);
  check(created.body?.shop?.code === "pawsco", `code is lowercased and trimmed (${created.body?.shop?.code})`);
  check(created.body?.shop?.commissionCents === 500, "commission comes from SHOP_COMMISSION_CENTS");
  check(created.body?.shop?.email === owner.email, "contact email is the signed-in address");
  check(/\/\?ref=pawsco$/.test(created.body?.link ?? ""), `link carries ?ref= (${created.body?.link})`);
  check(created.body?.stats?.registrations === 0 && created.body?.stats?.earnedCents === 0, "a new shop starts at zero");

  const taken = await api("/shop", { token: rival.token, method: "POST", body: { ...form, code: "PAWSCO" } });
  check(taken.status === 409 && /taken/.test(taken.body?.error ?? ""), `another account can't take the code (${taken.body?.error})`);

  const edited = await api("/shop", { token: owner.token, method: "POST", body: { ...form, businessName: "Paws & Co Pet Supply", code: "other" } });
  check(edited.body?.shop?.businessName === "Paws & Co Pet Supply", "details can be updated");
  check(edited.body?.shop?.code === "pawsco", "the code can't change after sign-up");

  // ── Public lookup and QR ────────────────────────────────────────────────
  console.log("\nLookup and QR");
  const look = await api("/shops/pawsco");
  check(look.status === 200 && look.body?.shop?.businessName === "Paws & Co Pet Supply", "GET /shops/<code> → display name");
  check(look.body?.shop?.email === undefined && look.body?.shop?.address === undefined, "lookup leaks no contact details");
  check((await api("/shops/nosuchshop")).status === 404, "unknown code → 404");

  const qr = await fetchRetry(`${BASE}/shops/pawsco/qr.png`);
  const bytes = new Uint8Array(await qr.arrayBuffer());
  check(qr.status === 200 && qr.headers.get("content-type") === "image/png", "QR → 200 image/png");
  check(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47, "QR body is a PNG");
  check((await fetchRetry(`${BASE}/shops/nosuchshop/qr.png`)).status === 404, "QR for an unknown code → 404");

  // ── Attribution ─────────────────────────────────────────────────────────
  console.log("\nCheckout attribution (Stripe is fake, so each checkout ends at 502 after writing its order)");
  const a = await checkoutWith(buyer, "PAWSCO");
  check(a.status === 502, `checkout reaches the Stripe call (${a.status} ${a.error ?? ""})`);
  check(a.row?.partner_code === "pawsco" && a.row?.commission_cents === 500, `order credited to the shop (${JSON.stringify(a.row)})`);
  // The control for every "no shop" check below: the same query reads 0 on a credited order.
  check(a.row?.no_shop === 0, "a credited order reads no_shop = 0");

  const none = await checkoutWith(buyer, undefined);
  check(none.row?.no_shop === 1, "no ref → no shop");

  const unknown = await checkoutWith(buyer, "nosuchshop");
  check(unknown.row?.no_shop === 1, "unknown code → no shop, checkout still goes ahead");

  const junk = await checkoutWith(buyer, "<script>");
  check(junk.row?.no_shop === 1, "junk ref → no shop");

  const self = await checkoutWith(owner, "pawsco");
  check(self.row?.no_shop === 1, "a shop buying through its own code earns nothing");

  check((await api("/admin/shops/pawsco/pause", { method: "POST", admin: true })).status === 200, "admin pauses the shop");
  const paused = await checkoutWith(buyer, "pawsco");
  check(paused.row?.no_shop === 1, "a paused shop isn't credited");
  check((await api("/shops/pawsco")).status === 404, "a paused shop's code doesn't resolve for customers");
  check((await api("/admin/shops/pawsco/activate", { method: "POST", admin: true })).status === 200, "admin reactivates it");
  check((await api("/admin/shops/pawsco/pause", { method: "POST" })).status === 401, "admin routes need the admin token");

  // ── Earnings ────────────────────────────────────────────────────────────
  console.log("\nEarnings");
  const b = await checkoutWith(buyer, "pawsco");
  const c = await checkoutWith(buyer, "pawsco");
  // Stand in for the webhook and the mint: one minted, one paid, one refunded.
  d1(`UPDATE orders SET status = 'minted' WHERE partner_code = 'pawsco' AND rowid = (SELECT MIN(rowid) FROM orders WHERE partner_code = 'pawsco')`);
  d1(`UPDATE orders SET status = 'paid' WHERE partner_code = 'pawsco' AND status = 'canceled' AND rowid = (SELECT MIN(rowid) FROM orders WHERE partner_code = 'pawsco' AND status = 'canceled')`);
  d1(`UPDATE orders SET status = 'refunded' WHERE partner_code = 'pawsco' AND status = 'canceled'`);
  check(!!b.row && !!c.row, "two more credited orders");

  const mine = await api("/shop", { token: owner.token });
  const s = mine.body?.stats;
  check(s?.registrations === 1 && s?.earnedCents === 500, `minted order earns, refunded doesn't (${JSON.stringify({ r: s?.registrations, e: s?.earnedCents })})`);
  check(s?.onTheWay === 1, "a paid, not-yet-minted order shows as on the way");
  check(s?.recent?.length === 2 && s.recent.every((x) => !("email" in x) && !("label" in x)), "recent list has no customer details");

  const rivalView = await api("/shop", { token: rival.token });
  check(rivalView.body?.shop === null, "another account doesn't see this shop");

  const list = await api("/admin/shops", { admin: true });
  const row = list.body?.shops?.find((x) => x.code === "pawsco");
  check(row?.registrations === 1 && row?.earned_cents === 500, "admin list shows the shop's totals");

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
