/**
 * PetID partner applications, and the IPFS upload proxy.
 *
 * The site is a static export served from IPFS, so there is no origin to POST
 * to — this worker is it. Three jobs, in this order of importance:
 *
 *   1. Never lose an application. Every valid submission is written to KV before
 *      anything else is attempted, so a mail outage costs a notification, not a
 *      lead.
 *   2. Notify. If RESEND_API_KEY is set the application is forwarded by email;
 *      if it isn't, the worker still accepts submissions and they're read back
 *      with GET /applications (bearer-authed).
 *   3. Pin to IPFS. `POST /upload` proxies a file to Pinata using a key held
 *      here as a secret.
 *
 * On (3): the Pinata key used to be NEXT_PUBLIC_PINATA_JWT, compiled into the
 * browser bundle — and that bundle is pinned to IPFS, which cannot be
 * unpublished. Every visitor could read the key, permanently, and it was the
 * same key several other projects used. Moving it here is the only version of
 * "rotate that key" that actually ends.
 *
 * A proxy with a key behind it is only worth having if it is not an open door,
 * so /upload is gated: allowed Origin, a size cap, a content-type allowlist,
 * and a per-IP rate limit. See uploadGate() for what each one is really worth.
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
  /**
   * wrangler secret put PINATA_JWT — an upload-only key scoped to PetID alone.
   * Must NEVER be given a NEXT_PUBLIC_ name anywhere: that prefix compiles the
   * value into the browser bundle, which is how the previous key ended up
   * permanently readable on IPFS.
   */
  PINATA_JWT?: string;
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

// ─── IPFS upload proxy ───────────────────────────────────────────────────────

/** 10 MB. A pet photo off a phone is 2-5 MB; nothing legitimate here is bigger. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Only what the mint flow actually produces: one photo, one profile page. */
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "text/html",
]);

/** Uploads per IP per hour. A mint costs two, so this is ~15 mints an hour. */
const RATE_LIMIT = 30;

/**
 * What stands between this endpoint and someone else's storage bill.
 *
 * Worth being honest about each one:
 *
 *   Origin  — a browser will not let a page forge it, so this stops any other
 *             website scripting our endpoint. It stops nothing from curl, which
 *             sends whatever it likes. It is a real control against drive-by
 *             abuse and no control at all against a determined person.
 *   Size    — bounds the damage per request whatever else fails.
 *   Type    — an open pinning endpoint that accepts any bytes is a free CDN for
 *             whatever someone wants our account associated with.
 *   Rate    — bounds the damage per hour. KV is not atomic, so a burst can slip
 *             a few past the limit; that is fine, this is a cost ceiling and not
 *             a correctness boundary.
 *
 * The strictly stronger gate is a wallet signature — every caller here already
 * has a wallet connected, and it would make uploads attributable. Deliberately
 * not done yet: it adds a signature prompt to a paid flow, and these four
 * together already take this from "anyone can spend our quota" to "anyone
 * determined can, slowly, and we can see it". Revisit if abuse shows up.
 */
async function uploadGate(
  req: Request,
  env: Env,
): Promise<{ error: string; status: number } | null> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes("*") && !allowed.includes(origin)) {
    return { error: "origin not allowed", status: 403 };
  }

  const len = Number(req.headers.get("Content-Length") ?? 0);
  if (len > MAX_UPLOAD_BYTES) return { error: "file too large", status: 413 };

  const ip = req.headers.get("CF-Connecting-IP") ?? "unknown";
  const hour = new Date().toISOString().slice(0, 13);
  const key = `rl:${hour}:${ip}`;
  const used = Number((await env.APPLICATIONS.get(key)) ?? 0);
  if (used >= RATE_LIMIT) {
    return { error: "rate limit reached, try again later", status: 429 };
  }
  // TTL just past the hour bucket, so these expire on their own.
  await env.APPLICATIONS.put(key, String(used + 1), { expirationTtl: 3900 });

  return null;
}

/**
 * Pin one file and return its CID.
 *
 * Pinata's own error text is never forwarded: it can echo the request, and the
 * request carries the key. The caller gets a status and nothing else.
 */

/* Pinata rejects an image whose *metadata* name has no extension with a 400 —
   not the multipart filename, the pinataMetadata name. Callers legitimately
   pass display labels like `fido-photo` or `x.eth-buildsite-og`, so the
   extension is restored here from the content type we already validated.
   HTML is accepted without one, which is why this only ever bit images and why
   it survived a client-side fix. */
const EXT_FOR_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/svg+xml": ".svg",
  "text/html": ".html",
};

function withExtension(name: string, type: string): string {
  if (/\.[A-Za-z0-9]{2,5}$/.test(name)) return name;
  return name + (EXT_FOR_TYPE[type] ?? "");
}

async function handleUpload(req: Request, env: Env, cors: Record<string, string>) {
  if (!env.PINATA_JWT) return json({ error: "upload not configured" }, 503, cors);

  const denied = await uploadGate(req, env);
  if (denied) return json({ error: denied.error }, denied.status, cors);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "expected multipart/form-data" }, 400, cors);
  }

  /* Duck-typed rather than `instanceof File`: the workers runtime types model a
     FormData entry as `string | File`, and `File` is not a value the compiler
     will narrow against here. Checking for the shape we actually use is both
     type-safe and honest about what we need from it. */
  const entry = form.get("file");
  if (!entry || typeof entry === "string" || typeof (entry as Blob).size !== "number") {
    return json({ error: "missing file field" }, 400, cors);
  }
  const file = entry as unknown as { size: number; type: string; name?: string };
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: "file too large" }, 413, cors);

  // Take the type from the bytes we received, not from a caller-supplied field.
  const type = (file.type || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    return json({ error: `content type not allowed: ${type || "unknown"}` }, 415, cors);
  }

  const rawName = String(form.get("name") ?? file.name ?? "upload");
  // The name reaches Pinata's metadata; keep it boring.
  const name = rawName.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80) || "upload";

  const out = new FormData();
    /* Forward the file under ITS OWN name, not the display name.
     Pinata rejects an image whose filename has no extension with a 400, and
     `name` here is a display label like `fido-photo` or `x.eth-buildsite-og`.
     Using it as the multipart filename stripped the extension a second time —
     after the client had already been fixed — so images failed while HTML,
     which Pinata accepts without an extension, kept working. The display name
     belongs in pinataMetadata and nowhere else. */
  out.append("file", entry as unknown as Blob, withExtension((entry as any).name || name, type));
  out.append("pinataMetadata", JSON.stringify({ name: withExtension(name, type), keyvalues: { app: "petid" } }));
  out.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.PINATA_JWT}` },
    body: out,
  });

  if (!res.ok) {
    console.error("pinata upload failed", res.status, (await res.text()).slice(0, 300));
    return json({ error: "upload failed", upstreamStatus: res.status }, 502, cors);
  }

  const data = (await res.json()) as { IpfsHash?: string };
  if (!data.IpfsHash) return json({ error: "upload failed" }, 502, cors);
  return json({ cid: data.IpfsHash }, 200, cors);
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

    // Before the application handler below: that branch treats *any* POST as a
    // partner application, so an unrouted /upload would be parsed as JSON and
    // rejected as a malformed application.
    if (url.pathname === "/upload") {
      if (req.method !== "POST") return json({ error: "POST a file" }, 405, cors);
      return handleUpload(req, env, cors);
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
