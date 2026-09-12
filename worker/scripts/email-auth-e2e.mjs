#!/usr/bin/env node
/**
 * End-to-end test of email sign-in. No chain, no anvil, no RPC — this path
 * never touches either, so the run takes seconds rather than minutes.
 *
 *   - wrangler dev runs the worker locally against a fresh local D1.
 *   - A tiny HTTP server stands in for Resend (RESEND_API_BASE), so the script
 *     can read the code it was mailed. Only the code's SHA-256 is ever stored,
 *     so there is no way to read it out of the database — which is the point.
 *
 * The property that matters most is the last one: an address that already has
 * a Google-created account must resolve to THAT account, or a buyer who signs
 * in by email can't see the name they paid for.
 *
 * Run from worker/:  node scripts/email-auth-e2e.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { rmSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";

const WORKER_PORT = 8798;
const MAIL_PORT = 8797;
const BASE = `http://127.0.0.1:${WORKER_PORT}`;
const PERSIST = ".wrangler/email-e2e";

const SESSION_SECRET = `e2e-${randomUUID()}`;
const ADMIN_TOKEN = `admin-${randomUUID()}`;

const children = [];
let failures = 0;
/** Every message the worker "sent", newest last. */
const mailbox = [];

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

/** wrangler dev restarts itself when a source file changes; ride out the gap. */
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

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetchRetry(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function d1(sql) {
  execFileSync("npx", ["wrangler", "d1", "execute", "petid-orders", "--local", "--persist-to", PERSIST,
    "-c", "wrangler.pay.toml", "--command", sql], { stdio: "pipe" });
}

function d1Read(sql) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "petid-orders", "--local", "--persist-to", PERSIST,
    "-c", "wrangler.pay.toml", "--json", "--command", sql], { stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
}

/** A session token the worker will accept, standing in for Google sign-in. */
function sessionFor(sub, email) {
  const payload = Buffer.from(JSON.stringify({ sub, email, name: "E2E", exp: Date.now() + 3600_000 })).toString("base64url");
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** Wait for a message to `to` that arrived after `since`, and pull the 6 digits out of it. */
async function codeFor(to, since) {
  const m = await until(
    () => mailbox.find((x) => x.at > since && x.to.includes(to)),
    `an email to ${to}`,
    20_000,
  );
  const digits = /\b(\d{3})\s?(\d{3})\b/.exec(m.text);
  if (!digits) throw new Error(`no code in the email to ${to}: ${m.text.slice(0, 200)}`);
  return { code: digits[1] + digits[2], mail: m };
}

function startMailServer() {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          const b = JSON.parse(raw);
          mailbox.push({ at: Date.now(), to: b.to ?? [], from: b.from, subject: b.subject ?? "", text: b.text ?? "", html: b.html ?? "" });
        } catch {
          /* ignore anything that isn't a Resend send */
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: `mock-${randomUUID()}` }));
      });
    });
    srv.listen(MAIL_PORT, "127.0.0.1", () => resolve(srv));
  });
}

function cleanup() {
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGKILL"); // whole process group: npx leaves workerd orphaned
    } catch {}
  }
  try {
    if (existsSync(".dev.vars")) unlinkSync(".dev.vars");
  } catch {}
}

async function main() {
  const mail = await startMailServer();
  console.log(`Mail capture on http://127.0.0.1:${MAIL_PORT}`);

  rmSync(PERSIST, { recursive: true, force: true });
  if (existsSync(".dev.vars")) throw new Error("worker/.dev.vars already exists; move it aside first");
  writeFileSync(".dev.vars", [
    `SESSION_SECRET=${SESSION_SECRET}`,
    `ADMIN_TOKEN=${ADMIN_TOKEN}`,
    "STRIPE_SECRET_KEY=sk_test_e2e_unused",
    "STRIPE_WEBHOOK_SECRET=whsec_e2e_unused",
    "RPC_URL=http://127.0.0.1:1", // never reached: nothing here touches the chain
    // Random, not a well-known dev key. Nothing here signs anything, but the
    // env var has to parse — and anvil's published keys carry real mainnet
    // state (including EIP-7702 sweeper delegations), so they never belong in
    // a config file, even an unused one. Same rule as pay-e2e.mjs.
    `FULFILLER_PRIVATE_KEY=0x${randomBytes(32).toString("hex")}`,
    "RESEND_API_KEY=re_e2e_mock",
    `RESEND_API_BASE=http://127.0.0.1:${MAIL_PORT}`,
  ].join("\n"));

  console.log("Applying migrations to a fresh local D1…");
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "petid-orders", "--local", "--persist-to", PERSIST,
    "-c", "wrangler.pay.toml"], { stdio: "pipe", env: { ...process.env, CI: "1" } });

  console.log("Starting wrangler dev…");
  children.push(spawn("npx", ["wrangler", "dev", "-c", "wrangler.pay.toml", "--local", "--port", String(WORKER_PORT),
    "--persist-to", PERSIST], { stdio: ["ignore", "ignore", "inherit"], detached: true }));
  await until(async () => (await fetch(`${BASE}/health`)).ok, "wrangler dev", 300_000);

  // ── Validation ──────────────────────────────────────────────────────────
  console.log("\nAddress validation");
  for (const bad of ["", "nope", "a@b", "a b@c.com", "@example.com", "x@y..com"]) {
    const r = await api("/auth/email/start", { method: "POST", body: { email: bad } });
    check(r.status === 400, `rejects ${JSON.stringify(bad)}`);
  }
  check((await api("/auth/email/start", { method: "POST", body: { email: `${"a".repeat(250)}@b.com` } })).status === 400,
    "rejects an over-long address");

  // ── A new address ───────────────────────────────────────────────────────
  console.log("\nFirst sign-in (address with no account)");
  const fresh = `fresh-${randomUUID().slice(0, 8)}@example.com`;
  let t0 = Date.now();
  check((await api("/auth/email/start", { method: "POST", body: { email: fresh } })).status === 200, "start → 200");
  const { code, mail: m1 } = await codeFor(fresh, t0);
  check(/^\d{6}$/.test(code), `a 6-digit code arrived (${code.slice(0, 1)}…)`);
  check(/sign-in code/i.test(m1.subject), "subject names the code");
  check(!/https?:\/\//.test(m1.text), "the text part has no link to click");
  check(!/bought a PetID/i.test(m1.html), "footer doesn't claim the reader bought something");

  console.log("\nWrong codes");
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
  const w1 = await api("/auth/email/verify", { method: "POST", body: { email: fresh, code: wrong } });
  check(w1.status === 400 && /isn't right/.test(w1.body?.error ?? ""), `wrong code → 400 (${w1.body?.error})`);
  check(/\d tries left/.test(w1.body?.error ?? ""), "says how many tries are left");
  check((await api("/auth/email/verify", { method: "POST", body: { email: fresh, code: "12345" } })).status === 400,
    "a 5-digit code → 400");

  console.log("\nThe right code");
  const ok = await api("/auth/email/verify", { method: "POST", body: { email: fresh, code } });
  check(ok.status === 200 && typeof ok.body?.token === "string", "verify → 200 with a token");
  check(ok.body?.user?.email === fresh, "returns the address");
  const freshToken = ok.body.token;
  check((await api("/me", { token: freshToken })).status === 200, "the token works on /me");
  check(((await api("/me", { token: freshToken })).body?.orders ?? []).length === 0, "new account has no orders");
  check((await api("/auth/email/verify", { method: "POST", body: { email: fresh, code } })).status === 400,
    "the same code a second time → 400 (single use)");

  const rows = d1Read(`SELECT sub, email FROM users WHERE lower(email) = '${fresh}'`);
  check(rows.length === 1, "exactly one account row");
  // Asserted in SQL, not JS: `wrangler d1 execute --json` renders a SQL NULL as
  // the STRING "null", so `!row.google_sub` is truthy-checked against "null"
  // and would pass for any value at all.
  check(d1Read(`SELECT COUNT(*) n FROM users WHERE lower(email) = '${fresh}' AND google_sub IS NULL`)[0].n === 1,
    "google_sub IS NULL for an email-only account");
  check(rows[0].sub !== fresh && rows[0].sub.length >= 32, "account id is a UUID, not the address");
  check(d1Read(`SELECT COUNT(*) n FROM login_codes WHERE email = '${fresh}'`)[0].n === 0, "code row consumed");

  // ── Spent codes ─────────────────────────────────────────────────────────
  console.log("\nBrute force is capped");
  const brute = `brute-${randomUUID().slice(0, 8)}@example.com`;
  t0 = Date.now();
  await api("/auth/email/start", { method: "POST", body: { email: brute } });
  const { code: bruteCode } = await codeFor(brute, t0);
  const bad = String((Number(bruteCode) + 7) % 1_000_000).padStart(6, "0");
  let lastErr = "";
  for (let i = 0; i < 5; i++) {
    lastErr = (await api("/auth/email/verify", { method: "POST", body: { email: brute, code: bad } })).body?.error ?? "";
  }
  check(/Too many|expired/i.test(lastErr), `5 wrong guesses spend the code (${lastErr})`);
  check((await api("/auth/email/verify", { method: "POST", body: { email: brute, code: bruteCode } })).status === 400,
    "the real code no longer works after the cap");

  // ── Cooldown, and no enumeration ────────────────────────────────────────
  console.log("\nCooldown and enumeration");
  const cool = `cool-${randomUUID().slice(0, 8)}@example.com`;
  t0 = Date.now();
  await api("/auth/email/start", { method: "POST", body: { email: cool } });
  await codeFor(cool, t0);
  const before = mailbox.length;
  const second = await api("/auth/email/start", { method: "POST", body: { email: cool } });
  await sleep(1500); // give a send time to land, if one were going to
  check(second.status === 200, "a second request inside the cooldown still → 200");
  check(mailbox.length === before, "…but sends no second email");

  const known = await api("/auth/email/start", { method: "POST", body: { email: fresh } });
  const unknown = await api("/auth/email/start", { method: "POST", body: { email: `nobody-${randomUUID().slice(0, 8)}@example.com` } });
  check(known.status === unknown.status && JSON.stringify(known.body) === JSON.stringify(unknown.body),
    "a known and an unknown address are indistinguishable");

  // ── The one that matters ────────────────────────────────────────────────
  console.log("\nGoogle and email converge on one account");
  const shared = `shared-${randomUUID().slice(0, 8)}@example.com`;
  const googleSub = `google-e2e-${randomUUID()}`;
  const now = Date.now();
  // A buyer who checked out with Google, exactly as handleGoogle would leave them.
  d1(`INSERT INTO users (sub, email, name, google_sub, created_at, last_login)
      VALUES ('${googleSub}', '${shared}', 'Shared Buyer', '${googleSub}', ${now}, ${now})`);
  const orderId = randomUUID();
  const label = `e2e${Date.now().toString(36)}`;
  d1(`INSERT INTO orders (id, user_sub, email, parent, label, contenthash, amount_cents, status, created_at, updated_at)
      VALUES ('${orderId}', '${googleSub}', '${shared}', 'dogid.eth', '${label}', '0xe30101701220${"ab".repeat(32)}', 1999, 'minted', ${now}, ${now})`);

  check(((await api("/me", { token: sessionFor(googleSub, shared) })).body?.orders ?? []).some((o) => o.id === orderId),
    "the Google session sees the order");

  t0 = Date.now();
  await api("/auth/email/start", { method: "POST", body: { email: shared } });
  const { code: sharedCode } = await codeFor(shared, t0);
  const sharedOk = await api("/auth/email/verify", { method: "POST", body: { email: shared, code: sharedCode } });
  check(sharedOk.status === 200, "the same address signs in by email");

  const sharedOrders = (await api("/me", { token: sharedOk.body.token })).body?.orders ?? [];
  check(sharedOrders.some((o) => o.id === orderId),
    "▶ signing in by email shows the name bought with Google");
  check(d1Read(`SELECT COUNT(*) n FROM users WHERE lower(email) = '${shared}'`)[0].n === 1,
    "▶ still exactly ONE account for that address");
  check(d1Read(`SELECT sub FROM users WHERE lower(email) = '${shared}'`)[0].sub === googleSub,
    "▶ the account kept its original id, so orders.user_sub still resolves");
  // Control for the IS NULL assertion earlier: a Google-linked row must NOT be
  // null, so the two checks together prove the column is really being read.
  check(d1Read(`SELECT COUNT(*) n FROM users WHERE lower(email) = '${shared}' AND google_sub IS NOT NULL`)[0].n === 1,
    "the Google-linked account has a non-null google_sub (control)");

  // Control: the test above must actually be able to fail.
  console.log("\nControl");
  const other = `other-${randomUUID().slice(0, 8)}@example.com`;
  t0 = Date.now();
  await api("/auth/email/start", { method: "POST", body: { email: other } });
  const { code: otherCode } = await codeFor(other, t0);
  const otherTok = (await api("/auth/email/verify", { method: "POST", body: { email: other, code: otherCode } })).body.token;
  check(!((await api("/me", { token: otherTok })).body?.orders ?? []).some((o) => o.id === orderId),
    "a DIFFERENT address does not see that order (so the check above means something)");
  check((await api(`/orders/${orderId}`, { token: otherTok })).status === 404, "and can't read it directly");

  // --dump-mail <dir> writes every captured message out, so a template can be
  // opened in a browser or a real mail client without sending anything.
  const dumpAt = process.argv.indexOf("--dump-mail");
  if (dumpAt !== -1 && process.argv[dumpAt + 1]) {
    const dir = process.argv[dumpAt + 1];
    mkdirSync(dir, { recursive: true });
    mailbox.forEach((m, i) => {
      const stem = `${String(i + 1).padStart(2, "0")}-${m.to[0]?.replace(/[^a-z0-9]/gi, "_") ?? "unknown"}`;
      if (m.html) writeFileSync(`${dir}/${stem}.html`, m.html);
      writeFileSync(`${dir}/${stem}.txt`, `Subject: ${m.subject}\nFrom: ${m.from}\nTo: ${m.to.join(", ")}\n\n${m.text}`);
    });
    console.log(`\nDumped ${mailbox.length} messages to ${dir}`);
  }

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} — ${mailbox.length} emails captured`);
  mail.close();
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

main()
  .then(() => {
    cleanup();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error("\nharness error:", e);
    cleanup();
    process.exit(1);
  });
