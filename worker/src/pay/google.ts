/**
 * Verifies a Google Identity Services ID token (the `credential` the Sign in
 * with Google button hands the page) without any SDK: an RS256 JWT checked
 * against Google's published keys, then its claims.
 */
import { b64urlDecode } from "./util";

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

// Per isolate. Google rotates keys every few days and says how long to cache
// them in Cache-Control; an unknown kid forces a refetch in case we're stale.
let jwks: { keys: Map<string, CryptoKey>; expires: number } | null = null;

async function keyFor(kid: string): Promise<CryptoKey | null> {
  if (!jwks || Date.now() > jwks.expires || !jwks.keys.has(kid)) {
    const res = await fetch(JWKS_URL);
    if (!res.ok) throw new Error(`google jwks ${res.status}`);
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("Cache-Control") ?? "")?.[1] ?? 3600);
    const { keys } = (await res.json()) as { keys: (JsonWebKey & { kid: string })[] };
    const map = new Map<string, CryptoKey>();
    for (const jwk of keys) {
      map.set(
        jwk.kid,
        await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]),
      );
    }
    jwks = { keys: map, expires: Date.now() + maxAge * 1000 };
  }
  return jwks.keys.get(kid) ?? null;
}

export async function verifyGoogleIdToken(token: string, clientId: string): Promise<GoogleIdentity | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;

  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(h)));
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
  } catch {
    return null;
  }
  // Pin the algorithm: accepting whatever the header says is the classic JWT hole.
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const key = await keyFor(header.kid);
  if (!key) return null;
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`),
  );
  if (!valid) return null;

  const now = Math.floor(Date.now() / 1000);
  // A token minted for any other Google client must not sign in here.
  if (claims.aud !== clientId) return null;
  if (!ISSUERS.has(String(claims.iss))) return null;
  if (typeof claims.exp !== "number" || claims.exp < now) return null;
  // The receipt and the claim link go to this address, so it has to be one
  // Google has confirmed the user controls.
  if (claims.email_verified !== true || typeof claims.email !== "string") return null;
  if (typeof claims.sub !== "string" || !claims.sub) return null;

  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    name: typeof claims.name === "string" ? claims.name : undefined,
    picture: typeof claims.picture === "string" ? claims.picture : undefined,
  };
}
