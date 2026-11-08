-- KasKelas data storage. All application writes go through the Neon Function API.
CREATE SCHEMA IF NOT EXISTS kaskelas;

CREATE TABLE IF NOT EXISTS kaskelas.app_documents (
  path text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kaskelas.app_credentials (
  kind text NOT NULL CHECK (kind IN ('owner', 'class_admin')),
  subject_id text NOT NULL,
  salt text NOT NULL,
  password_hash text NOT NULL,
  hash_scheme text NOT NULL DEFAULT 'scrypt',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, subject_id)
);

CREATE TABLE IF NOT EXISTS kaskelas.app_sessions (
  token_hash text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('owner', 'admin')),
  class_id text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'owner' AND class_id IS NULL) OR (role = 'admin' AND class_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON kaskelas.app_sessions (expires_at);

CREATE TABLE IF NOT EXISTS kaskelas.app_login_limits (
  scope text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz
);

-- This table is only accessed by the Neon Function using DATABASE_URL.
-- Do not expose it through a public Data API.
