-- W-CREDITS Phase 8 / W-TENANT-AUTH Phase 5 (Apr 30, 2026)
--
-- Replaces tenant-leaky unique index on chat_sessions with tenant-correct version.
--
-- Old index (idx_chat_sessions_walliam_unique) had two problems:
--   1. Hardcoded `source = 'walliam'` in the WHERE clause — Rule Zero violation,
--      tenant-2's sessions would not be covered by the constraint at all.
--   2. agent_id in the key allowed legitimate-looking duplicates whenever a user's
--      agent assignment changed, defeating the dedup purpose.
--
-- New index keys on (user_id, tenant_id, source) — strict one row per user per tenant
-- per session source. Race conditions on session creation surface as 23505 unique
-- violations at the database level instead of silently creating duplicate rows.
--
-- Idempotent: DROP IF EXISTS, CREATE INDEX IF NOT EXISTS.
--
-- Pre-application data resolution: 6 duplicate rows deleted (race-condition artifacts
-- and stale agent-change duplicates, all with message_count=0 and zero chat_messages_v2
-- references). DELETE was performed in same session before this migration; on a fresh
-- environment with no duplicates this migration is a no-op cleanup of the old index
-- followed by creation of the new one.

BEGIN;

DROP INDEX IF EXISTS idx_chat_sessions_walliam_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_sessions_user_tenant_source_unique
  ON chat_sessions (user_id, tenant_id, source)
  WHERE user_id IS NOT NULL AND tenant_id IS NOT NULL;

COMMIT;