/**
 * Session tokens: `<payload>.<hmac>`, both base64url, signed with SESSION_SECRET.
 * Stateless on purpose — the only thing a session grants is reading and acting
 * on this Google account's own orders, and every such action re-reads the order
 * from D1 scoped to `sub`.
 */
import { b64urlDecode, b64urlEncode } from "./util";

export interface Session {
  sub: string;
  email: string;
  name?: string;
  exp: number;
}

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const enc = new TextEncoder();

const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export async function issueSession(secret: string, user: Omit<Session, "exp">): Promise<string> {
  const payload = b64urlEncode(enc.encode(JSON.stringify({ ...user, exp: Date.now() + TTL_MS })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64urlEncode(sig)}`;
}

export async function readSession(token: string, secret: string): Promise<Session | null> {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  let sigBytes: Uint8Array;
  try {
    sigBytes = b64urlDecode(sig);
  } catch {
    return null;
  }
  // subtle.verify compares in constant time; a string compare would not.
  if (!(await crypto.subtle.verify("HMAC", await hmacKey(secret), sigBytes, enc.encode(payload)))) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as Session;
    return typeof s.sub === "string" && typeof s.exp === "number" && s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export async function sessionFrom(req: Request, secret: string): Promise<Session | null> {
  const auth = req.headers.get("Authorization") ?? "";
  return auth.startsWith("Bearer ") ? readSession(auth.slice(7), secret) : null;
}
