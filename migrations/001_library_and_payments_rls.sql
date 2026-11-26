-- Migration 001 UP: Library metadata, Payment idempotency & strict Row Level Security (RLS)
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS library_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL CHECK (length(owner_id) BETWEEN 3 AND 160),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 260),
  file_type TEXT NOT NULL DEFAULT 'doc' CHECK (file_type IN ('image', 'doc', 'artifact')),
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  source TEXT NOT NULL DEFAULT 'library' CHECK (source IN ('flow', 'user_upload', 'generated', 'artifact', 'library')),
  chat_title TEXT NOT NULL DEFAULT 'Library',
  object_key TEXT NOT NULL CHECK (object_key LIKE 'users/' || owner_id || '/%'),
  storage_bucket TEXT NOT NULL DEFAULT 'inline',
  upload_status TEXT NOT NULL DEFAULT 'ready' CHECK (upload_status IN ('pending', 'ready')),
  inline_content TEXT,
  inline_data_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_library_files_owner_updated
  ON library_files (owner_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS payment_transactions (
  transaction_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL CHECK (length(owner_id) BETWEEN 3 AND 160),
  idempotency_key TEXT NOT NULL,
  payment_method SMALLINT NOT NULL,
  amount_rub INTEGER NOT NULL CHECK (amount_rub > 0),
  currency TEXT NOT NULL DEFAULT 'RUB',
  status TEXT NOT NULL DEFAULT 'pending',
  payment_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  idem_key TEXT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (scope, owner_id, idem_key)
);

-- Enforce Row Level Security even for table owners
ALTER TABLE library_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_files FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS library_files_tenant_isolation ON library_files;
CREATE POLICY library_files_tenant_isolation ON library_files
  USING (owner_id = current_setting('app.current_user_id', true))
  WITH CHECK (owner_id = current_setting('app.current_user_id', true));

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_transactions_tenant_isolation ON payment_transactions;
CREATE POLICY payment_transactions_tenant_isolation ON payment_transactions
  USING (owner_id = current_setting('app.current_user_id', true))
  WITH CHECK (owner_id = current_setting('app.current_user_id', true));

ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS idempotency_keys_tenant_isolation ON idempotency_keys;
CREATE POLICY idempotency_keys_tenant_isolation ON idempotency_keys
  USING (owner_id = current_setting('app.current_user_id', true))
  WITH CHECK (owner_id = current_setting('app.current_user_id', true));

INSERT INTO schema_migrations (version)
VALUES ('001_library_and_payments_rls')
ON CONFLICT (version) DO NOTHING;

COMMIT;
