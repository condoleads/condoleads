-- supabase/migrations/20260430_phase_d0_atomic_session_counters.sql
-- W-CREDIT-VERIFY Phase D0 — atomic counter RPC
-- Replaces read-modify-write UPDATE pattern in /api/charlie/route.ts
-- with row-level atomic increment, eliminating F5 race condition.
--
-- Counter columns covered: message_count, buyer_plans_used, seller_plans_used, estimator_count
-- Also bumps last_activity_at on every increment (retires F25).
--
-- Whitelisted column names prevent SQL injection via p_counter argument.
-- SECURITY DEFINER allows authenticated/service_role callers to update
-- without needing direct table grants on chat_sessions.

BEGIN;

-- Drop prior incarnation if migration is re-run
DROP FUNCTION IF EXISTS increment_chat_session_counter(UUID, TEXT);

CREATE OR REPLACE FUNCTION increment_chat_session_counter(
  p_session_id UUID,
  p_counter    TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_value INTEGER;
BEGIN
  -- Whitelist: only allow incrementing known counter columns.
  -- Prevents SQL injection via dynamic column name.
  IF p_counter NOT IN (
    'message_count',
    'buyer_plans_used',
    'seller_plans_used',
    'estimator_count'
  ) THEN
    RAISE EXCEPTION 'invalid counter name: % (allowed: message_count, buyer_plans_used, seller_plans_used, estimator_count)', p_counter
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Atomic increment. Row-level lock acquired by UPDATE ensures concurrent
  -- callers serialize on this single row. No read-before-write window.
  EXECUTE format(
    'UPDATE chat_sessions
        SET %1$I = COALESCE(%1$I, 0) + 1,
            last_activity_at = NOW()
      WHERE id = $1
      RETURNING %1$I',
    p_counter
  )
  USING p_session_id
  INTO v_new_value;

  -- If session row didn't exist, RETURNING yields NULL. Surface this as an error
  -- so the route handler doesn't silently miscount.
  IF v_new_value IS NULL THEN
    RAISE EXCEPTION 'chat_session not found: %', p_session_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_new_value;
END $$;

-- Add a similar atomic decrement for the chat-credit refund path
-- (used when a plan is generated within the same turn — see route.ts:402).
-- This is symmetric to the increment for clean call-site swap.
DROP FUNCTION IF EXISTS decrement_chat_session_counter(UUID, TEXT);

CREATE OR REPLACE FUNCTION decrement_chat_session_counter(
  p_session_id UUID,
  p_counter    TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_value INTEGER;
BEGIN
  IF p_counter NOT IN (
    'message_count',
    'buyer_plans_used',
    'seller_plans_used',
    'estimator_count'
  ) THEN
    RAISE EXCEPTION 'invalid counter name: %', p_counter
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  EXECUTE format(
    'UPDATE chat_sessions
        SET %1$I = GREATEST(0, COALESCE(%1$I, 0) - 1),
            last_activity_at = NOW()
      WHERE id = $1
      RETURNING %1$I',
    p_counter
  )
  USING p_session_id
  INTO v_new_value;

  IF v_new_value IS NULL THEN
    RAISE EXCEPTION 'chat_session not found: %', p_session_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_new_value;
END $$;

GRANT EXECUTE ON FUNCTION increment_chat_session_counter(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION decrement_chat_session_counter(UUID, TEXT) TO authenticated, service_role;

-- Smoke check — invalid counter name must raise
DO $$
BEGIN
  BEGIN
    PERFORM increment_chat_session_counter('00000000-0000-0000-0000-000000000000'::uuid, 'evil_column_name');
    RAISE EXCEPTION 'whitelist failed — invalid counter was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    -- expected
    NULL;
  END;
END $$;

-- Smoke check — non-existent session must raise no_data_found
DO $$
BEGIN
  BEGIN
    PERFORM increment_chat_session_counter('00000000-0000-0000-0000-000000000000'::uuid, 'message_count');
    RAISE EXCEPTION 'no_data_found check failed — non-existent session was accepted';
  EXCEPTION WHEN no_data_found THEN
    -- expected
    NULL;
  END;
END $$;

COMMIT;

-- ─── Verification (run manually after migration) ──────────────────────────
--
-- 1. Function exists:
--      SELECT proname, prosrc IS NOT NULL AS has_body, prosecdef AS security_definer
--      FROM pg_proc WHERE proname IN ('increment_chat_session_counter', 'decrement_chat_session_counter');
--
-- 2. Test on a real session (replace UUID with a real chat_sessions.id):
--      SELECT increment_chat_session_counter('<real-session-uuid>'::uuid, 'message_count');
--      -- Returns the new value. Run again to see it increment.
--
-- 3. Concurrent-correctness check (run from psql, two terminals):
--      Terminal 1: BEGIN; SELECT increment_chat_session_counter('<uuid>', 'message_count'); -- don't commit
--      Terminal 2: SELECT increment_chat_session_counter('<uuid>', 'message_count'); -- blocks
--      Terminal 1: COMMIT;
--      Terminal 2: returns immediately with serialized value.