/**
 * Browser client for the petid-pay worker (worker/src/pay): Google sign-in,
 * card checkout, order status and claims.
 *
 * The session is a bearer token in localStorage rather than a cookie: the site
 * and the worker are on different registrable domains, and Safari drops
 * third-party cookies. It only grants access to this Google account's own
 * orders.
 */

export const PAY_API = (process.env.NEXT_PUBLIC_PAY_API ?? "").replace(/\/$/, "");
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
/**
 * Card checkout needs the worker and nothing else: signing in by email works
 * without a Google client id, so only a missing PAY_API hides card payments.
 * GOOGLE_CLIENT_ID being empty just drops the Google button (SignInPanel).
 */
export const cardPaymentsEnabled = !!PAY_API;
/** Display only. The worker charges its own PRICE_CENTS (worker/wrangler.pay.toml). */
export const CARD_PRICE_CENTS = 1999;

export type OrderStatus =
  | "pending" | "paid" | "minting" | "minted" | "claim_requested" | "claiming" | "claimed"
  | "expired" | "canceled" | "refunded" | "revoke_needed" | "revoked";

export interface PayOrder {
  id: string;
  name: string;
  parent: "dogid.eth" | "catid.eth";
  label: string;
  status: OrderStatus;
  amountCents: number;
  mintTx: string | null;
  claimTo: string | null;
  claimTx: string | null;
  claimFailed: boolean;
  createdAt: number;
}

export interface PayUser {
  email: string;
  name: string | null;
}

export interface PaySession {
  token: string;
  user: PayUser;
}

const STORAGE_KEY = "petid.pay.session";

function tokenExpiry(token: string): number {
  try {
    const payload = token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
    return Number(JSON.parse(atob(payload)).exp) || 0;
  } catch {
    return 0;
  }
}

// Storage can throw (private mode, blocked site data), so every access is guarded.
export function loadSession(): PaySession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PaySession;
    if (!s?.token || tokenExpiry(s.token) < Date.now() + 60_000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: PaySession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: s.token, user: s.user }));
  } catch {}
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export class PayError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(
  path: string,
  opts: { token?: string; method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  if (!PAY_API) throw new PayError("Card payments aren't available on this version of the site.", 0);
  let res: Response;
  try {
    res = await fetch(`${PAY_API}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new PayError("Couldn't reach PetID's payment service. Check your connection and try again.", 0);
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new PayError(data.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export const payApi = {
  signIn: (credential: string) =>
    call<PaySession>("/auth/google", { method: "POST", body: { credential } }),
  /**
   * Ask for a sign-in code. Resolves the same way for an address that has an
   * account and one that doesn't — the worker won't say which, so the UI must
   * not imply it either.
   */
  emailStart: (email: string) =>
    call<{ ok: true }>("/auth/email/start", { method: "POST", body: { email } }),
  emailVerify: (email: string, code: string) =>
    call<PaySession>("/auth/email/verify", { method: "POST", body: { email, code } }),
  me: (token: string) =>
    call<{ user: PayUser; orders: PayOrder[] }>("/me", { token }),
  checkout: (
    token: string,
    // petName and photoUrl are for the receipt email only; the worker validates both.
    body: { parent: string; label: string; contenthash: string; returnUrl: string; petName?: string; photoUrl?: string },
  ) =>
    call<{ url: string; orderId: string }>("/checkout", { token, method: "POST", body }),
  order: (token: string, id: string) =>
    call<{ order: PayOrder }>(`/orders/${id}`, { token }),
  claimMessage: (token: string, id: string, to: string) =>
    call<{ message: string }>(`/orders/${id}/claim-message?to=${to}`, { token }),
  claim: (token: string, id: string, to: string, signature: string) =>
    call<{ order: PayOrder }>(`/orders/${id}/claim`, { token, method: "POST", body: { to, signature } }),
};
