/**
 * Sign in with any email address, using a one-time code.
 *
 * A code typed back into the page rather than a magic link, on purpose:
 *
 *   * The site is a static export served from several origins
 *     (petid.eth.limo, petid.eth.link, ipfs.onchain-id.id). A link has to embed
 *     one absolute origin and would be the wrong one for somebody.
 *   * The buyer stays in the tab they started in, so a half-filled registration
 *     form survives signing in. A link opens a new tab and loses it.
 *   * Mail scanners prefetch links and would burn a single-use token before the
 *     human ever clicked it.
 *
 * The code is never stored — only its SHA-256 — so a database read can't be
 * replayed as a login.
 */
import { acquireLease } from "./db";
import { emailLoginCode } from "./email";
import type { Env } from "./env";

/** How long a code is good for. Long enough to alt-tab to a phone, short enough to matter. */
const CODE_TTL_MS = 10 * 60 * 1000;
/** Wrong guesses before the code is spent. 5 of 1,000,000 inside 10 minutes. */
const MAX_ATTEMPTS = 5;
/** One code per address per minute, so nobody can be mailbombed via this endpoint. */
const RESEND_COOLDOWN_MS = 60 * 1000;

const CODE_DIGITS = 6;

/**
 * Lowercased and trimmed. Deliberately NOT dot-stripped or plus-stripped:
 * "a.b@gmail.com" and "ab@gmail.com" are the same Google mailbox but are
 * different addresses at most other providers, so normalising them would let
 * one person take over another's account anywhere but Gmail.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  // One @, something either side, a dot in the domain, no whitespace.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e)) return null;
  return e;
}

/** A uniformly random 6-digit code, zero-padded. Rejection-sampled so every code is equally likely. */
function generateCode(): string {
  const max = 10 ** CODE_DIGITS;
  // 2^24 is not a multiple of 10^6, so values in the tail would be biased.
  const limit = Math.floor(0x1000000 / max) * max;
  const buf = new Uint8Array(3);
  for (;;) {
    crypto.getRandomValues(buf);
    const n = (buf[0] << 16) | (buf[1] << 8) | buf[2];
    if (n < limit) return String(n % max).padStart(CODE_DIGITS, "0");
  }
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Length-independent, data-independent compare. Both inputs here are hex digests. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface StartResult {
  /** Whether an email was actually sent. The ROUTE must not leak this to the caller. */
  sent: boolean;
  /** Set when Resend refused; logged, never returned to the browser. */
  error?: string;
}

/**
 * Issue a code and mail it.
 *
 * Callers must respond identically whether or not this sent anything: the
 * endpoint would otherwise be an oracle for "does this person have an account".
 */
export async function startEmailLogin(env: Env, email: string): Promise<StartResult> {
  // The lease doubles as the cooldown: if one is already held for this address,
  // a code went out within the last minute and is still valid.
  const fresh = await acquireLease(env, `login:${email}`, "emailauth", RESEND_COOLDOWN_MS);
  if (!fresh) return { sent: false };

  const code = generateCode();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO login_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT (email) DO UPDATE SET
       code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
  ).bind(email, await sha256Hex(code), now + CODE_TTL_MS, now).run();

  const error = await emailLoginCode(env, email, code, Math.round(CODE_TTL_MS / 60000));
  if (error) {
    // The stored code is useless if the mail never arrived, and leaving it would
    // hold the cooldown against a retry.
    await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
    return { sent: false, error };
  }
  return { sent: true };
}

export type VerifyResult =
  | { ok: true; sub: string; email: string; name: string | null }
  | { ok: false; error: string; status: number };

/**
 * Check a code and resolve it to an account, creating one on first sign-in.
 *
 * An address that already has a Google-created account resolves to THAT account,
 * which is the point: the buyer sees the order they paid for either way.
 */
export async function verifyEmailLogin(env: Env, email: string, code: string): Promise<VerifyResult> {
  if (!/^[0-9]{6}$/.test(code)) return { ok: false, error: "That code doesn't look right.", status: 400 };

  const row = await env.DB.prepare(
    "SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?",
  ).bind(email).first<{ code_hash: string; expires_at: number; attempts: number }>();

  // Same message for "never asked", "expired" and "used up": none of them should
  // tell an attacker which addresses have a code in flight.
  const stale = { ok: false as const, error: "That code has expired. Ask for a new one.", status: 400 };
  if (!row || row.expires_at < Date.now() || row.attempts >= MAX_ATTEMPTS) {
    if (row) await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
    return stale;
  }

  if (!constantTimeEqual(row.code_hash, await sha256Hex(code))) {
    // Count the miss first, so a hammering client runs out of attempts even if
    // it never waits for our response.
    const r = await env.DB.prepare(
      "UPDATE login_codes SET attempts = attempts + 1 WHERE email = ? AND attempts < ?",
    ).bind(email, MAX_ATTEMPTS).run();
    const left = MAX_ATTEMPTS - row.attempts - 1;
    if (!r.meta.changes || left <= 0) {
      await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
      return { ok: false, error: "Too many wrong codes. Ask for a new one.", status: 429 };
    }
    return {
      ok: false,
      error: `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`,
      status: 400,
    };
  }

  // Correct: spend it immediately, so it can't be replayed.
  await env.DB.prepare("DELETE FROM login_codes WHERE email = ?").bind(email).run();
  const user = await accountForEmail(env, email);
  return { ok: true, ...user };
}

/**
 * The account for a verified mailbox, created on first use.
 *
 * `users.sub` is the account id. A row created here gets a UUID; a row created
 * by Google sign-in keeps Google's sub. Either way this returns the existing row
 * when the address already has one.
 */
async function accountForEmail(env: Env, email: string): Promise<{ sub: string; email: string; name: string | null }> {
  const now = Date.now();
  const find = () =>
    env.DB.prepare("SELECT sub, email, name FROM users WHERE lower(email) = ?")
      .bind(email).first<{ sub: string; email: string; name: string | null }>();

  let row = await find();
  if (!row) {
    // OR IGNORE rather than ON CONFLICT: the uniqueness comes from an index on
    // lower(email), an expression, and this stays correct without naming it.
    await env.DB.prepare(
      "INSERT OR IGNORE INTO users (sub, email, name, google_sub, created_at, last_login) VALUES (?, ?, NULL, NULL, ?, ?)",
    ).bind(crypto.randomUUID(), email, now, now).run();
    // Re-read: two simultaneous verifications race, and the loser's insert is ignored.
    row = await find();
  }
  if (!row) throw new Error(`could not create or read account for ${email}`);

  await env.DB.prepare("UPDATE users SET last_login = ? WHERE sub = ?").bind(now, row.sub).run();
  return { sub: row.sub, email: row.email, name: row.name };
}

/** Drop codes nobody used. Called from the cron sweep; expiry already makes them useless. */
export const sweepLoginCodes = (env: Env) =>
  env.DB.prepare("DELETE FROM login_codes WHERE expires_at < ?").bind(Date.now()).run();
