import type { Env } from "./env";

export type OrderStatus =
  | "pending" | "paid" | "minting" | "minted" | "claim_requested" | "claiming" | "claimed"
  | "expired" | "canceled" | "refunded" | "revoke_needed" | "revoked";

export interface OrderRow {
  id: string;
  user_sub: string;
  email: string;
  parent: string;
  label: string;
  contenthash: string;
  amount_cents: number;
  status: OrderStatus;
  stripe_session_id: string | null;
  payment_intent: string | null;
  order_ref: string | null;
  mint_tx: string | null;
  claim_to: string | null;
  claim_tx: string | null;
  error: string | null;
  attempts: number;
  created_at: number;
  updated_at: number;
}

const UPDATABLE = new Set<keyof OrderRow>([
  "status", "stripe_session_id", "payment_intent", "order_ref", "mint_tx", "claim_to", "claim_tx", "error", "attempts",
]);

export const getOrder = (env: Env, id: string) =>
  env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<OrderRow>();

/**
 * Update an order, optionally only if it is still in one of `fromStatuses`.
 * Returns whether a row changed — the compare-and-set that keeps a webhook
 * retry, a cron run and a user click from applying the same transition twice.
 */
export async function updateOrder(
  env: Env, id: string, fields: Partial<OrderRow>, fromStatuses?: OrderStatus[],
): Promise<boolean> {
  const cols = Object.keys(fields).filter((k) => UPDATABLE.has(k as keyof OrderRow)) as (keyof OrderRow)[];
  const sets = [...cols.map((c) => `${c} = ?`), "updated_at = ?"];
  const binds: unknown[] = [...cols.map((c) => fields[c] ?? null), Date.now(), id];
  let sql = `UPDATE orders SET ${sets.join(", ")} WHERE id = ?`;
  if (fromStatuses?.length) {
    sql += ` AND status IN (${fromStatuses.map(() => "?").join(",")})`;
    binds.push(...fromStatuses);
  }
  const r = await env.DB.prepare(sql).bind(...binds).run();
  return r.meta.changes > 0;
}

/** What the site is allowed to see about an order. */
export function publicOrder(o: OrderRow) {
  return {
    id: o.id,
    name: `${o.label}.${o.parent}`,
    parent: o.parent,
    label: o.label,
    status: o.status,
    amountCents: o.amount_cents,
    mintTx: o.mint_tx,
    claimTo: o.claim_to,
    claimTx: o.claim_tx,
    // The error text itself stays server-side (it can be a raw RPC message);
    // the account page only needs to know the last claim didn't land.
    claimFailed: o.status === "minted" && /^claim /.test(o.error ?? ""),
    createdAt: o.created_at,
  };
}

/**
 * Take a named lease if nobody holds an unexpired one. One statement, so two
 * invocations racing for it can't both win.
 */
export async function acquireLease(env: Env, name: string, holder: string, ttlMs: number): Promise<boolean> {
  const now = Date.now();
  const r = await env.DB.prepare(
    `INSERT INTO leases (name, holder, expires_at) VALUES (?, ?, ?)
     ON CONFLICT (name) DO UPDATE SET holder = excluded.holder, expires_at = excluded.expires_at
     WHERE leases.expires_at < ?`,
  ).bind(name, holder, now + ttlMs, now).run();
  return r.meta.changes > 0;
}

export async function releaseLease(env: Env, name: string, holder: string): Promise<void> {
  await env.DB.prepare("DELETE FROM leases WHERE name = ? AND holder = ?").bind(name, holder).run();
}

/** At most one of these per `key` per `everyMs`. Keeps a stuck queue from emailing every minute. */
export const shouldAlert = (env: Env, key: string, everyMs: number) =>
  acquireLease(env, `alert:${key}`, "alert", everyMs);
