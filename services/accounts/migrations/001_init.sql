-- Users keep only what Zil needs: a display name and an email address.
-- google_sub is Google's stable account id; it is the login key because emails can change.
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub    text NOT NULL UNIQUE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  email         text NOT NULL CHECK (char_length(email) <= 254),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_email_idx ON users (lower(email));

-- Server-side sessions. The browser holds a random token in an HttpOnly cookie;
-- only its SHA-256 hash is stored, so a database leak does not leak live sessions.
CREATE TABLE sessions (
  id_hash    bytea PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);
