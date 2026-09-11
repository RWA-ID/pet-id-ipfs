#!/usr/bin/env node
/**
 * End-to-end test of petid-pay against a mainnet fork. No real money, no Stripe
 * account, no Google login:
 *
 *   - anvil forks mainnet. On the fork, the Safe approves PetIDRegistrarV5 and
 *     the owner points the fulfiller at a throwaway key.
 *   - wrangler dev runs the worker locally with a fresh local D1.
 *   - This script plays Stripe (signed webhooks) and the buyer (session token,
 *     wallet signature), then checks the chain after every step.
 *
 * Covered: forged webhook rejected; paid → custodial mint; replayed webhook
 * doesn't double-mint; orders are private to their account; a claim signed by
 * the wrong wallet is refused; signed claim → released with permanent fuses;
 * refund after mint → revoke_needed → owner revokes → name for sale again.
 *
 * Not covered: creating a Checkout Session (needs a Stripe test key) and the
 * Google token check (needs a browser sign-in).
 *
 * Run from worker/:  FORK_URL=<mainnet rpc> node scripts/pay-e2e.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { rmSync, writeFileSync, existsSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, keccak256, namehash, parseAbi, parseEther, toBytes, toHex, zeroHash,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

const FORK_URL = process.env.FORK_URL;
if (!FORK_URL) {
  console.error("Set FORK_URL to a mainnet RPC.");
  process.exit(1);
}

const ANVIL_PORT = 8546;
const WORKER_PORT = 8799;
const RPC = `http://127.0.0.1:${ANVIL_PORT}`;
const BASE = `http://127.0.0.1:${WORKER_PORT}`;
const PERSIST = ".wrangler/e2e";

const V5 = "0xe189666820863F6e7c578c81eFd7ED9eAb24d1bb";
const NAME_WRAPPER = "0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401";
const RESOLVER = "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63";
const SAFE = "0xbD2ea72ceC060295a0295e7846107968A5dDe1Cc";

// Fresh keys every run. Well-known dev keys (anvil's account 0 and friends)
// carry real mainnet state, including EIP-7702 sweeper delegations, which a
// fork faithfully reproduces.
const FULFILLER_KEY = generatePrivateKey();
const buyer = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const SESSION_SECRET = `e2e-${randomUUID()}`;
const WEBHOOK_SECRET = `whsec_e2e_${randomUUID()}`;
const ADMIN_TOKEN = `admin-${randomUUID()}`;

const V5_ABI = parseAbi([
  "function owner() view returns (address)",
  "function setFulfiller(address)",
  "function custodyOrder(bytes32) view returns (bytes32)",
  "function orderNode(bytes32) view returns (bytes32)",
  "function revokeCustodial(bytes32 parentNode, string label)",
]);
const WRAPPER_ABI = parseAbi([
  "function setApprovalForAll(address,bool)",
  "function ownerOf(uint256) view returns (address)",
  "function getData(uint256) view returns (address,uint32,uint64)",
]);
const RESOLVER_ABI = parseAbi(["function contenthash(bytes32) view returns (bytes)"]);

const pub = createPublicClient({ chain: mainnet, transport: http(RPC) });
const children = [];
let failures = 0;

function check(ok, what) {
  console.log(`  ${ok ? "✔" : "✘"} ${what}`);
  if (!ok) failures++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** wrangler dev restarts itself when a source file changes; ride out the gap instead of aborting the run. */
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
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${what} (last: ${last?.message ?? JSON.stringify(last)})`);
}

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

/** Send a transaction as any address, via anvil impersonation. */
async function sendAs(from, to, abi, functionName, args) {
  await rpc("anvil_impersonateAccount", [from]);
  await rpc("anvil_setBalance", [from, toHex(parseEther("10"))]);
  const wallet = createWalletClient({ account: from, chain: mainnet, transport: http(RPC) });
  const hash = await wallet.writeContract({ address: to, abi, functionName, args });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  await rpc("anvil_stopImpersonatingAccount", [from]);
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
}

function d1(sql) {
  execFileSync("npx", ["wrangler", "d1", "execute", "petid-orders", "--local", "--persist-to", PERSIST,
    "-c", "wrangler.pay.toml", "--command", sql], { stdio: "pipe" });
}

function sessionFor(sub, email) {
  const payload = Buffer.from(JSON.stringify({ sub, email, name: "E2E", exp: Date.now() + 3600_000 })).toString("base64url");
  const sig = createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetchRetry(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function webhook(event, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const res = await fetchRetry(`${BASE}/stripe/webhook`, {
    method: "POST",
    headers: { "Stripe-Signature": `t=${t},v1=${sig}`, "Content-Type": "application/json" },
    body,
  });
  return res.status;
}

/** Wait for an order to reach a status, nudging the cron in case waitUntil lost the race. */
async function orderReaches(id, token, status) {
  return until(async () => {
    const r = await api(`/orders/${id}`, { token });
    if (r.body?.order?.status === status) return r.body.order;
    await fetch(`${BASE}/__scheduled?cron=*+*+*+*+*`).catch(() => {});
    return null;
  }, `order ${id} → ${status}`);
}

function newOrder(sub, email) {
  const id = randomUUID();
  const label = `e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const sessionId = `cs_test_e2e_${randomUUID().replace(/-/g, "")}`;
  const contenthash = `0xe30101701220${Buffer.from(keccak256(toBytes(label)).slice(2), "hex").toString("hex")}`;
  const now = Date.now();
  d1(`INSERT INTO orders (id, user_sub, email, parent, label, contenthash, amount_cents, status, stripe_session_id, order_ref, created_at, updated_at)
      VALUES ('${id}', '${sub}', '${email}', 'dogid.eth', '${label}', '${contenthash}', 1999, 'pending', '${sessionId}', '${keccak256(toBytes(sessionId))}', ${now}, ${now})`);
  return { id, label, sessionId, contenthash, node: namehash(`${label}.dogid.eth`), orderRef: keccak256(toBytes(sessionId)) };
}

const paidEvent = (o, pi) => ({
  type: "checkout.session.completed",
  data: { object: { id: o.sessionId, payment_status: "paid", payment_intent: pi, metadata: { order_id: o.id } } },
});

async function main() {
  // ── Fork ────────────────────────────────────────────────────────────────
  console.log("Starting anvil fork…");
  // detached = its own process group, so cleanup can kill the whole tree.
  children.push(spawn("anvil", ["--fork-url", FORK_URL, "--port", String(ANVIL_PORT), "--silent"], { stdio: "inherit", detached: true }));
  await until(() => rpc("eth_chainId", []), "anvil", 180_000);

  const fulfiller = privateKeyToAccount(FULFILLER_KEY);
  await sendAs(SAFE, NAME_WRAPPER, WRAPPER_ABI, "setApprovalForAll", [V5, true]);
  const owner = await pub.readContract({ address: V5, abi: V5_ABI, functionName: "owner" });
  await sendAs(owner, V5, V5_ABI, "setFulfiller", [fulfiller.address]);
  await rpc("anvil_setBalance", [fulfiller.address, toHex(parseEther("1"))]);
  console.log(`Fork ready at block ${await pub.getBlockNumber()}; fulfiller ${fulfiller.address}`);

  // ── Worker ──────────────────────────────────────────────────────────────
  rmSync(PERSIST, { recursive: true, force: true });
  if (existsSync(".dev.vars")) throw new Error("worker/.dev.vars already exists; move it aside first");
  writeFileSync(".dev.vars", [
    `RPC_URL=${RPC}`,
    `FULFILLER_PRIVATE_KEY=${FULFILLER_KEY}`,
    `SESSION_SECRET=${SESSION_SECRET}`,
    `STRIPE_WEBHOOK_SECRET=${WEBHOOK_SECRET}`,
    "STRIPE_SECRET_KEY=sk_test_e2e_unused",
    `ADMIN_TOKEN=${ADMIN_TOKEN}`,
    "MAX_GAS_GWEI=1000",
  ].join("\n"));

  console.log("Applying migrations to a fresh local D1…");
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "petid-orders", "--local", "--persist-to", PERSIST,
    "-c", "wrangler.pay.toml"], { stdio: "pipe", env: { ...process.env, CI: "1" } });

  console.log("Starting wrangler dev…");
  children.push(spawn("npx", ["wrangler", "dev", "-c", "wrangler.pay.toml", "--local", "--port", String(WORKER_PORT),
    "--persist-to", PERSIST, "--test-scheduled"], { stdio: ["ignore", "ignore", "inherit"], detached: true }));
  await until(async () => (await fetch(`${BASE}/health`)).ok, "wrangler dev", 300_000);

  const alice = { sub: `google-e2e-${randomUUID()}`, email: "alice@example.com" };
  const mallory = { sub: `google-e2e-${randomUUID()}`, email: "mallory@example.com" };
  const now = Date.now();
  d1(`INSERT INTO users (sub, email, name, created_at, last_login) VALUES
      ('${alice.sub}', '${alice.email}', 'Alice', ${now}, ${now}), ('${mallory.sub}', '${mallory.email}', 'Mallory', ${now}, ${now})`);
  const aliceToken = sessionFor(alice.sub, alice.email);
  const malloryToken = sessionFor(mallory.sub, mallory.email);

  // ── Auth ────────────────────────────────────────────────────────────────
  console.log("\nAuth");
  check((await api("/me")).status === 401, "no session → 401");
  check((await api("/me", { token: aliceToken.slice(0, -2) + "xx" })).status === 401, "tampered session → 401");
  check((await api("/auth/google", { method: "POST", body: { credential: "a.b.c" } })).status === 401, "garbage Google credential → 401");

  // ── Pay → custodial mint ────────────────────────────────────────────────
  console.log("\nPayment and custodial mint");
  const o1 = newOrder(alice.sub, alice.email);
  check((await webhook(paidEvent(o1, "pi_e2e_1"), "whsec_wrong")) === 400, "webhook with a forged signature → 400");
  check((await api(`/orders/${o1.id}`, { token: aliceToken })).body?.order?.status === "pending", "forged webhook changed nothing");

  check((await webhook(paidEvent(o1, "pi_e2e_1"))) === 200, "signed paid webhook → 200");
  await orderReaches(o1.id, aliceToken, "minted");
  check(true, "order reached minted");
  check((await pub.readContract({ address: NAME_WRAPPER, abi: WRAPPER_ABI, functionName: "ownerOf", args: [BigInt(o1.node)] })) === V5,
    "name is held by the registrar");
  check((await pub.readContract({ address: RESOLVER, abi: RESOLVER_ABI, functionName: "contenthash", args: [o1.node] })) === o1.contenthash,
    "profile contenthash is live");
  check((await pub.readContract({ address: V5, abi: V5_ABI, functionName: "custodyOrder", args: [o1.node] })) === o1.orderRef,
    "custody is recorded under the Stripe session's order ref");

  const txsBefore = await pub.getTransactionCount({ address: fulfiller.address });
  check((await webhook(paidEvent(o1, "pi_e2e_1"))) === 200, "replayed paid webhook → 200");
  await fetchRetry(`${BASE}/__scheduled?cron=*+*+*+*+*`);
  await sleep(3000);
  check((await pub.getTransactionCount({ address: fulfiller.address })) === txsBefore, "replay sent no second mint");

  // ── Privacy ─────────────────────────────────────────────────────────────
  console.log("\nOrders are private");
  check((await api(`/orders/${o1.id}`, { token: malloryToken })).status === 404, "another account can't read the order");
  check(((await api("/me", { token: malloryToken })).body?.orders ?? []).length === 0, "another account's /me is empty");
  check(((await api("/me", { token: aliceToken })).body?.orders ?? []).some((x) => x.id === o1.id), "the buyer's /me lists it");

  // ── Claim ───────────────────────────────────────────────────────────────
  console.log("\nClaim");
  const { body: msg } = await api(`/orders/${o1.id}/claim-message?to=${buyer.address}`, { token: aliceToken });
  check(typeof msg?.message === "string" && msg.message.includes(buyer.address), "claim message names the wallet");

  const wrongSig = await stranger.signMessage({ message: msg.message });
  check((await api(`/orders/${o1.id}/claim`, { token: aliceToken, method: "POST", body: { to: buyer.address, signature: wrongSig } })).status === 400,
    "claim signed by a different wallet → 400");
  const sig = await buyer.signMessage({ message: msg.message });
  check((await api(`/orders/${o1.id}/claim`, { token: malloryToken, method: "POST", body: { to: buyer.address, signature: sig } })).status === 404,
    "another account can't claim it, even with a valid signature");

  check((await api(`/orders/${o1.id}/claim`, { token: aliceToken, method: "POST", body: { to: buyer.address, signature: sig } })).status === 200,
    "signed claim → 200");
  const claimed = await orderReaches(o1.id, aliceToken, "claimed");
  check(!!claimed.claimTx, "claim transaction recorded");
  const [holder, fuses] = await pub.readContract({ address: NAME_WRAPPER, abi: WRAPPER_ABI, functionName: "getData", args: [BigInt(o1.node)] });
  check(holder === buyer.address, "name is in the buyer's wallet");
  check(Number(fuses) === 0x10001, `fuses are permanent (0x${Number(fuses).toString(16)})`);
  check((await pub.readContract({ address: V5, abi: V5_ABI, functionName: "custodyOrder", args: [o1.node] })) === zeroHash, "custody cleared");
  check((await api(`/orders/${o1.id}/claim`, { token: aliceToken, method: "POST", body: { to: buyer.address, signature: sig } })).status === 409,
    "claiming twice → 409");

  // ── Refund after mint ───────────────────────────────────────────────────
  console.log("\nRefund after mint");
  const o2 = newOrder(alice.sub, alice.email);
  await webhook(paidEvent(o2, "pi_e2e_2"));
  await orderReaches(o2.id, aliceToken, "minted");
  check((await webhook({ type: "charge.refunded", data: { object: { payment_intent: "pi_e2e_2", refunded: true } } })) === 200,
    "charge.refunded webhook → 200");
  check((await api(`/orders/${o2.id}`, { token: aliceToken })).body?.order?.status === "revoke_needed", "order is revoke_needed");
  const msg2 = (await api(`/orders/${o2.id}/claim-message?to=${buyer.address}`, { token: aliceToken })).body.message;
  check((await api(`/orders/${o2.id}/claim`, { token: aliceToken, method: "POST",
    body: { to: buyer.address, signature: await buyer.signMessage({ message: msg2 }) } })).status === 409,
    "a refunded order can't be claimed");

  const adminRevoked = (token) => fetchRetry(`${BASE}/admin/orders/${o2.id}/revoked`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  check((await adminRevoked("wrong")).status === 401, "admin endpoint rejects a wrong token");
  check((await adminRevoked(ADMIN_TOKEN)).status === 409, "can't mark revoked before the chain says so");
  await sendAs(owner, V5, V5_ABI, "revokeCustodial", [namehash("dogid.eth"), o2.label]);
  const rev = await (await adminRevoked(ADMIN_TOKEN)).json();
  check(rev.ok === true && rev.nameAvailable === true, "after the owner revokes: marked revoked, name available again");

  // ── Checkout without Stripe ─────────────────────────────────────────────
  console.log("\nCheckout validation (no Stripe key, so no session is created)");
  const bad = await api("/checkout", { token: aliceToken, method: "POST",
    body: { parent: "dogid.eth", label: "x", contenthash: o1.contenthash, returnUrl: "https://petid.eth.limo/register/" } });
  check(bad.status === 400, "too-short label → 400");
  const redirect = await api("/checkout", { token: aliceToken, method: "POST",
    body: { parent: "dogid.eth", label: "fine-name", contenthash: o1.contenthash, returnUrl: "https://evil.example/register/" } });
  check(redirect.status === 400, "return URL on a foreign host → 400");
  const taken = await api("/checkout", { token: aliceToken, method: "POST",
    body: { parent: "dogid.eth", label: o1.label, contenthash: o1.contenthash, returnUrl: "https://petid.eth.limo/register/" } });
  check(taken.status === 409, "checkout for a name already on-chain → 409");
}

main()
  .catch((e) => {
    console.error("\nE2E aborted:", e.message);
    failures++;
  })
  .finally(() => {
    rmSync(".dev.vars", { force: true });
    // `npx wrangler dev` runs workerd as a grandchild; killing npx alone leaves it holding the port.
    for (const c of children) {
      try {
        process.kill(-c.pid, "SIGTERM");
      } catch {
        c.kill("SIGTERM");
      }
    }
    console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
    setTimeout(() => process.exit(failures ? 1 : 0), 1500);
  });
