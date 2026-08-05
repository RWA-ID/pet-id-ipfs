/**
 * PetID partner applications.
 *
 * The site is a static export served from IPFS, so there is no origin to POST
 * to — this worker is it. Two jobs, in this order of importance:
 *
 *   1. Never lose an application. Every valid submission is written to KV before
 *      anything else is attempted, so a mail outage costs a notification, not a
 *      lead.
 *   2. Notify. If RESEND_API_KEY is set the application is forwarded by email;
 *      if it isn't, the worker still accepts submissions and they're read back
 *      with GET /applications (bearer-authed).
 */

export interface Env {
  APPLICATIONS: KVNamespace;
  /** Comma-separated origins allowed to POST. */
  ALLOWED_ORIGINS: string;
  /** Where notifications go. */
  NOTIFY_EMAIL: string;
  /** Verified sender on the Resend account. */
  NOTIFY_FROM: string;
  /** wrangler secret put RESEND_API_KEY — optional, email is best-effort. */
  RESEND_API_KEY?: string;
  /** wrangler secret put ADMIN_TOKEN — required to read applications back. */
  ADMIN_TOKEN?: string;
}

interface Application {
  wallet: string;
  businessName: string;
  businessType: string;
  contactName: string;
  email: string;
  phone?: string;
  city: string;
  country: string;
  website?: string;
  volume?: string;
  plannedPrice?: string;
  notes?: string;
  submittedAt?: string;
  /** Set only when the notification email failed — see notify(). */
  notifyError?: string;
}

const REQUIRED = [
  "wallet", "businessName", "businessType", "contactName", "email", "city", "country",
] as const;

/** Cap every field — a KV value is not a place to accept arbitrary length. */
const MAX_LEN: Record<string, number> = {
  wallet: 42, businessName: 64, businessType: 40, contactName: 64, email: 96,
  phone: 40, city: 64, country: 64, website: 120, volume: 40, plannedPrice: 12,
  notes: 800,
};

const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  // The app is served from several hosts (petid.eth.link, an IPFS gateway, a
  // partner's iframe), so echo back a match rather than hardcoding one.
  const ok = allowed.includes("*") || allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : allowed[0] ?? "",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function validate(body: unknown): { app: Application } | { error: string } {
  if (typeof body !== "object" || body === null) return { error: "Expected a JSON object" };
  const raw = body as Record<string, unknown>;
  const app: Record<string, string> = {};

  for (const [key, limit] of Object.entries(MAX_LEN)) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== "string") return { error: `${key} must be a string` };
    const trimmed = v.trim();
    if (trimmed.length > limit) return { error: `${key} is too long (max ${limit})` };
    if (trimmed) app[key] = trimmed;
  }

  for (const key of REQUIRED) {
    if (!app[key]) return { error: `${key} is required` };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(app.wallet)) return { error: "wallet must be a 0x address" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(app.email)) return { error: "email looks invalid" };

  return { app: { ...app, submittedAt: new Date().toISOString() } as unknown as Application };
}

function asText(app: Application) {
  return [
    `Wallet:          ${app.wallet}`,
    `Business:        ${app.businessName}`,
    `Type:            ${app.businessType}`,
    `Contact:         ${app.contactName}`,
    `Email:           ${app.email}`,
    `Phone/WhatsApp:  ${app.phone ?? "—"}`,
    `Location:        ${app.city}, ${app.country}`,
    `Website:         ${app.website ?? "—"}`,
    `Expected volume: ${app.volume ?? "—"}`,
    `Planned price:   ${app.plannedPrice ? `$${app.plannedPrice}` : "—"}`,
    `Submitted:       ${app.submittedAt}`,
    "",
    `Notes: ${app.notes ?? "—"}`,
  ].join("\n");
}

/**
 * Best-effort email notification. Returns an error string on failure rather
 * than throwing — the application is already durable in KV and the applicant
 * shouldn't see a 500 because our mail provider hiccuped.
 *
 * The caller records the returned error *onto the stored record*, because the
 * most likely failure is a silent one: Resend rejects any `from` that isn't a
 * verified sender on the account, and a console line nobody reads is
 * indistinguishable from mail that arrived.
 */
async function notify(app: Application, env: Env): Promise<string | null> {
  if (!env.RESEND_API_KEY) return "RESEND_API_KEY not set";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.NOTIFY_FROM,
        to: [env.NOTIFY_EMAIL],
        reply_to: app.email,
        subject: `PetID partner application — ${app.businessName}`,
        text: asText(app),
      }),
    });
    if (res.ok) return null;
    const detail = (await res.text()).slice(0, 300);
    console.error("resend failed", res.status, detail);
    return `resend ${res.status}: ${detail}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("resend threw", msg);
    return `resend threw: ${msg}`;
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    // Read submissions back. Bearer-authed because it returns contact details.
    if (req.method === "GET" && url.pathname === "/applications") {
      const auth = req.headers.get("Authorization") ?? "";
      if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) {
        return json({ error: "unauthorized" }, 401);
      }
      const list = await env.APPLICATIONS.list({ prefix: "app:", limit: 200 });
      const items = await Promise.all(
        list.keys.map((k) => env.APPLICATIONS.get(k.name, "json")),
      );
      return json({ count: items.length, applications: items });
    }

    if (req.method !== "POST") {
      return json({ error: "POST an application as JSON" }, 405, cors);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Body must be valid JSON" }, 400, cors);
    }

    const result = validate(body);
    if ("error" in result) return json({ error: result.error }, 400, cors);
    const { app } = result;

    // One application per wallet per day: a resubmission overwrites rather than
    // piling up, and a bot can't fill KV by looping on the same address.
    const day = app.submittedAt!.slice(0, 10);
    const key = `app:${day}:${app.wallet.toLowerCase()}`;
    await env.APPLICATIONS.put(key, JSON.stringify(app));

    // Email after the write, and outside the response path — the applicant
    // doesn't wait on our mail provider. A failure is stamped back onto the
    // record so `GET /applications` shows which leads were never emailed.
    ctx.waitUntil(
      notify(app, env).then((err) =>
        err ? env.APPLICATIONS.put(key, JSON.stringify({ ...app, notifyError: err })) : undefined,
      ),
    );

    return json({ ok: true }, 200, cors);
  },
} satisfies ExportedHandler<Env>;
