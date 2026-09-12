-- Sign in with any email address, alongside Google.
--
-- `users.sub` stops meaning "Google's sub" and becomes the account id:
--   * accounts that already exist keep the sub they have, so every
--     orders.user_sub value and every live 30-day session token stays valid;
--   * email-only accounts get a UUID.
-- Google's sub moves to its own column, so the provider is still recorded and
-- a returning Google user is still matched by it first.
--
-- Deliberately additive: rebuilding `users` would break the
-- `orders.user_sub REFERENCES users(sub)` foreign key on a live payments
-- database, for no gain beyond a tidier column name.

ALTER TABLE users ADD COLUMN google_sub TEXT;
UPDATE users SET google_sub = sub WHERE google_sub IS NULL;

-- One account per mailbox. This index is the whole point of the migration: it
-- is what makes Google sign-in and email sign-in land on the SAME row instead
-- of giving one person two accounts and hiding their order from them.
CREATE UNIQUE INDEX users_by_email ON users (lower(email));
CREATE UNIQUE INDEX users_by_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;

-- One-time sign-in codes.
--
-- Only the SHA-256 of the code is stored, so a database read can't be replayed
-- as a login. One row per address (PRIMARY KEY), so requesting a new code
-- invalidates the previous one rather than leaving several valid at once.
CREATE TABLE login_codes (
  email       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  -- Wrong guesses. At the cap the row is spent, so a 6-digit code can't be
  -- brute-forced (5 tries out of a million, inside 10 minutes).
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE INDEX login_codes_by_expiry ON login_codes (expires_at);
