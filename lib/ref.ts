/**
 * Pet-shop referral codes.
 *
 * A shop's flyer QR opens the site with ?ref=<code>. The visitor may read the
 * homepage, leave, and come back days later to register, so the code is kept
 * in localStorage and sent with the card checkout (worker/src/pay/shops.ts).
 * The most recent shop wins, and a code older than REF_TTL_MS is dropped.
 *
 * Capture runs as an inline script in app/layout.tsx rather than in a React
 * effect: it then works on every page, including a gateway visit where
 * hydration never finishes.
 */

const REF_KEY = "petid.ref";
const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Must match normalizeShopCode in worker/src/pay/util.ts. */
const CODE_RE = "^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$";

export function normalizeShopCode(raw: string): string | null {
  const code = raw.trim().toLowerCase();
  return new RegExp(CODE_RE).test(code) && !code.includes("--") ? code : null;
}

/** Stringified into a <script> in the root layout. ES5 and self-contained on purpose. */
export const REF_CAPTURE_SCRIPT = `(function(){try{
var c=new URLSearchParams(location.search).get("ref");if(!c)return;
c=c.trim().toLowerCase();if(!/${CODE_RE}/.test(c)||c.indexOf("--")>=0)return;
localStorage.setItem(${JSON.stringify(REF_KEY)},JSON.stringify({code:c,at:Date.now()}));
}catch(e){}})();`;

export function loadRef(): string | null {
  try {
    const raw = localStorage.getItem(REF_KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code?: string; at?: number };
    if (!code || !at || Date.now() - at > REF_TTL_MS) {
      localStorage.removeItem(REF_KEY);
      return null;
    }
    return normalizeShopCode(code);
  } catch {
    return null;
  }
}

/** A code the buyer typed in themselves counts the same as a scan. */
export function saveRef(code: string) {
  try {
    localStorage.setItem(REF_KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {}
}
