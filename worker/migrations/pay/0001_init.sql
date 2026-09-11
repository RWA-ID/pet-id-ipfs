-- PetID card orders. Applied with:
--   npx wrangler d1 migrations apply petid-orders --remote -c wrangler.pay.toml

-- Keyed on Google's `sub`, which never changes; an account's email can.
CREATE TABLE users (
  sub         TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  name        TEXT,
  created_at  INTEGER NOT NULL,
  last_login  INTEGER NOT NULL
);

-- One row per checkout attempt. Statuses and their transitions are documented
-- at the top of src/pay/index.ts.
CREATE TABLE orders (
  id                 TEXT PRIMARY KEY,
  user_sub           TEXT NOT NULL REFERENCES users(sub),
  email              TEXT NOT NULL,
  parent             TEXT NOT NULL,
  label              TEXT NOT NULL,
  contenthash        TEXT NOT NULL,
  amount_cents       INTEGER NOT NULL,
  status             TEXT NOT NULL,
  stripe_session_id  TEXT UNIQUE,
  payment_intent     TEXT,
  -- keccak256(stripe_session_id): the orderRef PetIDRegistrarV5 mints under.
  order_ref          TEXT,
  mint_tx            TEXT,
  claim_to           TEXT,
  claim_tx           TEXT,
  error              TEXT,
  attempts           INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE INDEX orders_by_user ON orders (user_sub, created_at);
CREATE INDEX orders_by_status ON orders (status, updated_at);
CREATE INDEX orders_by_payment_intent ON orders (payment_intent);

-- The reservation. While an order is live, nobody else can open a checkout for
-- the same name — enforced by the database rather than by a read-then-write in
-- the worker, which two simultaneous checkouts would both pass.
CREATE UNIQUE INDEX orders_one_live_per_name ON orders (parent, label)
  WHERE status NOT IN ('expired', 'canceled', 'refunded', 'revoked');

-- Mutual exclusion across worker invocations: the chain lease keeps a single
-- transaction in flight for the fulfiller wallet, and alert:* rows rate-limit
-- admin emails.
CREATE TABLE leases (
  name        TEXT PRIMARY KEY,
  holder      TEXT NOT NULL,
  expires_at  INTEGER NOT NULL
);
