-- Pet shops that earn a commission on card registrations they send us.
--
-- A shop signs up on /shops/ with the same sign-in a buyer uses, and gets a
-- code. The code is what goes in its flyer's QR (?ref=<code>) and what a
-- customer types at checkout, so it never changes once created: the flyers are
-- already printed.
--
-- Separate from the on-chain reseller program on /partner/, which is wallet
-- based and paid in ETH/USDC by the registrar contract itself.
CREATE TABLE partners (
  code              TEXT PRIMARY KEY,
  -- The account that manages this shop. One shop per account.
  user_sub          TEXT NOT NULL UNIQUE REFERENCES users(sub),
  business_name     TEXT NOT NULL,
  contact_name      TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  address           TEXT NOT NULL,
  -- Per shop, so a deal with one shop doesn't change everyone's rate. Copied
  -- onto each order at checkout; changing it here never rewrites past orders.
  commission_cents  INTEGER NOT NULL,
  -- active: earns on new orders. paused: the code still resolves, but new
  -- orders aren't attributed to it.
  status            TEXT NOT NULL DEFAULT 'active',
  -- acct_… once the shop connects a bank through Stripe Connect. NULL until
  -- payouts are built; attribution doesn't need it.
  stripe_account_id TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

-- Which shop sent this order, and what it earns for it, fixed when checkout opens.
ALTER TABLE orders ADD COLUMN partner_code TEXT REFERENCES partners(code);
ALTER TABLE orders ADD COLUMN commission_cents INTEGER;

CREATE INDEX orders_by_partner ON orders (partner_code, created_at) WHERE partner_code IS NOT NULL;
