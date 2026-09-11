import type { Env } from "./env";

export const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
}

export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = allowedOrigins(env);
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] ?? "",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    // Authorization carries the session token. It is a bearer header rather than
    // a cookie: the site and this worker are on different registrable domains,
    // and Safari drops third-party cookies.
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Error text safe to store: viem's shortMessage when there is one, capped. */
export function short(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string };
  return String(err?.shortMessage ?? err?.message ?? e).slice(0, 300);
}

export function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const PARENTS = ["dogid.eth", "catid.eth"] as const;

/** The registrar's own label rules, checked here so a bad label never reaches Stripe. */
export function labelError(label: string): string | null {
  if (label.length < 3) return "name must be at least 3 characters";
  if (label.length > 42) return "name must be at most 42 characters";
  if (!/^[a-z0-9-]+$/.test(label)) return "name may only use a-z, 0-9 and hyphens";
  if (label.startsWith("-") || label.endsWith("-")) return "name can't start or end with a hyphen";
  return null;
}
