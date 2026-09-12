export interface Env {
  DB: D1Database;

  // [vars] in wrangler.pay.toml
  GOOGLE_CLIENT_ID: string;
  REGISTRAR_ADDRESS: string;
  ALLOWED_ORIGINS: string;
  PRICE_CENTS: string;
  MAX_GAS_GWEI: string;
  SITE_URL: string;
  /** This worker's own public origin. Emails link to /qr/<order>.png on it, and
   *  they're sent from cron and webhook contexts where there's no request to infer it from. */
  PUBLIC_URL: string;
  NOTIFY_EMAIL: string;
  NOTIFY_FROM: string;

  // Secrets
  STRIPE_SECRET_KEY: string;
  /** whsec_… of the webhook endpoint pointed at /stripe/webhook. */
  STRIPE_WEBHOOK_SECRET: string;
  /** Random 32+ bytes. Signs session tokens; rotating it signs everyone out. */
  SESSION_SECRET: string;
  /** The fulfiller hot wallet set on PetIDRegistrarV5. Holds gas money and nothing else. */
  FULFILLER_PRIVATE_KEY: string;
  /**
   * A server-side RPC URL. Not a public endpoint — those throttle Cloudflare's
   * shared egress IPs — and not a browser key with an Origin allowlist, since a
   * worker sends no Origin.
   */
  RPC_URL: string;
  RESEND_API_KEY?: string;
  /**
   * Resend's API origin. Only ever set away from the default to point mail at a
   * local capture server — scripts/email-auth-e2e.mjs needs to read the sign-in
   * code it was sent, and only the code's hash is ever stored.
   */
  RESEND_API_BASE?: string;
  ADMIN_TOKEN?: string;
}
