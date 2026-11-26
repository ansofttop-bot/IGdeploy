-- Migration 001 DOWN: Reversible rollback for Library & Payments RLS schema
BEGIN;

DROP POLICY IF EXISTS idempotency_keys_tenant_isolation ON idempotency_keys;
DROP POLICY IF EXISTS payment_transactions_tenant_isolation ON payment_transactions;
DROP POLICY IF EXISTS library_files_tenant_isolation ON library_files;

DROP TABLE IF EXISTS idempotency_keys;
DROP TABLE IF EXISTS payment_transactions;
DROP INDEX IF EXISTS idx_library_files_owner_updated;
DROP TABLE IF EXISTS library_files;

DELETE FROM schema_migrations WHERE version = '001_library_and_payments_rls';

COMMIT;
