#!/usr/bin/env node
/**
 * Stamps a Content-Security-Policy into every built page in out/.
 *
 * Why a <meta> tag and not a header: the site is a static export pinned to
 * IPFS, so we never serve the response ourselves. eth.limo already adds
 * `frame-ancestors 'self'`, X-Frame-Options, HSTS, nosniff and Referrer-Policy
 * on its own — the one thing no gateway can know for us is which origins this
 * app is allowed to load code from and talk to. That has to travel inside the
 * document.
 *
 * Why a build step and not a <meta> in app/layout.tsx: a meta CSP only governs
 * what the parser sees *after* it, and React decides where in <head> a hoisted
 * tag lands — in practice after the stylesheet and the whole run of /_next
 * script tags. Injecting straight after <head> is the only way to cover the
 * document from the first byte.
 *
 * Every origin below was confirmed against a real WalletConnect pairing rather
 * than guessed: with the policy live, a securitypolicyviolation listener stayed
 * empty through opening the modal and rendering the QR, while a control origin
 * outside the policy was blocked. Re-run that check after an AppKit upgrade —
 * note that CSP violations do NOT appear in console.log-style tooling, so
 * "no errors in the console" is not evidence of anything here.
 *
 * Usage: node scripts/inject-csp.mjs   (wired into `npm run build`)
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "out");
config({ path: join(ROOT, ".env.local") });

/**
 * Read an origin out of the same env var the app builds its URLs from, so
 * pointing the app at a different gateway or RPC can never leave the policy
 * behind — a drifted allowlist here surfaces as a dead upload or a dead chain
 * read, with nothing in the console to explain it.
 */
const originOf = (envVar, fallback) => {
  const raw = process.env[envVar] ?? fallback;
  if (!raw) return [];
  try { return [new URL(raw).origin]; }
  catch { console.error(`  ✗ ${envVar} is not a URL: ${raw}`); process.exit(1); }
};

/**
 * Reown AppKit spreads itself over several hosts and moves between
 * walletconnect.com, walletconnect.org and web3modal.org across releases:
 * api.web3modal.org serves the wallet list and its icons, pulse.* takes
 * telemetry, relay.* is the websocket a QR pairing rides on, and secure.* is
 * the Verify iframe. Wildcarding the three registrable domains rather than
 * pinning subdomains is deliberate — a pinned list turns a routine AppKit
 * upgrade into a dead connect button, and the blast radius of the wildcard is
 * "WalletConnect's own infrastructure", which we already trust with the
 * pairing.
 */
const WALLETCONNECT = [
  "https://*.walletconnect.com",
  "https://*.walletconnect.org",
  "https://*.web3modal.org",
];

/** The Coinbase connector phones cca-lite for metrics and keys.* for its popup. */
const COINBASE = ["https://*.coinbase.com"];

/** The IPFS gateway the app links and previews pins through. */
const PINATA_GATEWAY = originOf("NEXT_PUBLIC_PINATA_GATEWAY", "https://gateway.pinata.cloud");

/** Alchemy for chain reads/writes, Pinata for the profile upload, the worker for applications. */
const APP_BACKENDS = [
  ...originOf("NEXT_PUBLIC_RPC_URL_MAINNET", "https://eth-mainnet.g.alchemy.com"),
  ...originOf("NEXT_PUBLIC_RPC_URL_SEPOLIA", "https://eth-sepolia.g.alchemy.com"),
  "https://api.pinata.cloud",
  ...PINATA_GATEWAY,
  ...originOf("NEXT_PUBLIC_PARTNER_APPLY_URL", ""),
];

const POLICY = [
  ["default-src", "'self'"],
  ["base-uri", "'self'"],
  ["object-src", "'none'"],
  // No form on this site posts anywhere by native submit — the partner
  // application goes out through fetch(), which connect-src governs.
  ["form-action", "'self'"],

  // 'unsafe-inline' is not optional here and it is worth being honest about
  // why: Next inlines its bootstrap and RSC payload as inline <script>, and a
  // static export has no server to mint a per-response nonce. What this
  // directive still buys is the origin restriction — an injected
  // <script src="https://evil/…"> is blocked, as is any attempt to exfiltrate
  // to an origin not named below, which is the half that carries data out.
  ["script-src", "'self' 'unsafe-inline' 'wasm-unsafe-eval'"],

  // AppKit injects its theme into shadow DOM at runtime, page.tsx carries an
  // inline <style>, and that style block @imports Google Fonts.
  ["style-src", "'self' 'unsafe-inline' https://fonts.googleapis.com"],
  // fonts.reown.com is AppKit's own typeface (KHTeka), pulled by the modal's
  // stylesheet at open time. Blocking it does not break the connect flow, which
  // is exactly why it is easy to ship by accident: the modal silently falls back
  // to the page's serif and simply looks wrong.
  ["font-src", "'self' data: https://fonts.gstatic.com https://fonts.reown.com"],

  // blob: is the pet photo preview and the QR download; data: is wallet icons.
  // images.unsplash.com is the sample dog photo in the homepage hero card — it
  // is a CSS background-image in app/page.tsx, so it is governed by img-src and
  // fails *silently* (an empty card, no error in the console) when left out.
  ["img-src", ["'self'", "data:", "blob:", ...WALLETCONNECT,
    ...PINATA_GATEWAY, "https://images.unsplash.com"].join(" ")],

  ["connect-src", ["'self'", ...APP_BACKENDS, ...WALLETCONNECT, ...COINBASE,
    "wss://*.walletconnect.com", "wss://*.walletconnect.org"].join(" ")],

  ["frame-src", ["'self'", ...WALLETCONNECT, "https://keys.coinbase.com"].join(" ")],
  ["worker-src", "'self' blob:"],
  ["manifest-src", "'self'"],
].map(([k, v]) => `${k} ${v}`).join("; ");

// frame-ancestors is deliberately absent: it is ignored in a meta CSP (and
// Chrome logs a console warning for it), and eth.limo already sends it as a
// real header. Same for report-uri — there is nowhere to report to.

const TAG = `<meta http-equiv="Content-Security-Policy" content="${POLICY}">`;
const EXISTING = /<meta http-equiv="Content-Security-Policy"[^>]*>/gi;

const htmlFiles = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? htmlFiles(full)
      : entry.endsWith(".html") ? [full] : [];
  });

let stamped = 0;
for (const file of htmlFiles(OUT)) {
  const html = readFileSync(file, "utf8");
  // Re-running must not stack tags, so strip any previous one first.
  const clean = html.replace(EXISTING, "");
  if (!clean.includes("<head>")) {
    console.error(`  ✗ ${file}: no <head> to inject into`);
    process.exit(1);
  }
  writeFileSync(file, clean.replace("<head>", `<head>${TAG}`));
  stamped++;
}

console.log(`CSP stamped into ${stamped} page${stamped === 1 ? "" : "s"}.`);
