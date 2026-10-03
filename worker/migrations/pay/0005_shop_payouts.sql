-- Paying pet shops their referral commissions through Stripe Connect.
--
-- Once a month (worker/src/pay/payouts.ts) each shop with a connected bank is
-- sent one transfer covering every order that has earned and is past the
-- refund hold, minus any order that was paid out before and has since been
-- refunded or revoked. Each order points at the payout that paid it, and at
-- the payout that took it back, so an order can never be paid or clawed back
-- twice and every transfer can be traced to its orders.

-- Mirrors Stripe: 1 once the shop's Express account can receive transfers.
-- Refreshed from Stripe whenever the shop opens its dashboard and before each run.
ALTER TABLE partners ADD COLUMN payouts_enabled INTEGER NOT NULL DEFAULT 0;

CREATE TABLE payouts (
  id                  TEXT PRIMARY KEY,
  partner_code        TEXT NOT NULL REFERENCES partners(code),
  -- Copied from the shop at the time, so a later reconnect can't redirect an old payout.
  stripe_account_id   TEXT NOT NULL,
  amount_cents        INTEGER NOT NULL,
  credit_cents        INTEGER NOT NULL,
  debit_cents         INTEGER NOT NULL,
  orders_count        INTEGER NOT NULL,
  -- pending: recorded, transfer not confirmed yet. paid: Stripe accepted the
  -- transfer. failed: Stripe refused it; retried on the next run and by admin.
  status              TEXT NOT NULL,
  stripe_transfer_id  TEXT,
  error               TEXT,
  attempts            INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE INDEX payouts_by_partner ON payouts (partner_code, created_at);
CREATE INDEX payouts_by_status ON payouts (status, updated_at);

ALTER TABLE orders ADD COLUMN payout_id TEXT REFERENCES payouts(id);
ALTER TABLE orders ADD COLUMN clawback_payout_id TEXT REFERENCES payouts(id);

CREATE INDEX orders_unpaid_commission ON orders (partner_code, created_at)
  WHERE partner_code IS NOT NULL AND payout_id IS NULL;
