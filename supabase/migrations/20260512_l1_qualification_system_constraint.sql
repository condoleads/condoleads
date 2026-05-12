-- supabase/migrations/20260512_l1_qualification_system_constraint.sql
-- W-LEADS-UI-POLISH L1: agent-set qualification system (UNION CHECK)
--
-- Before: CHECK ((quality = ANY (ARRAY['cold'::text, 'warm'::text, 'hot'::text])))
-- After:  CHECK ((quality = ANY (ARRAY[
--           'hot'::text, 'warm'::text, 'cold'::text,
--           'unqualified'::text, 'qualified_hot'::text,
--           'qualified_cold'::text, 'disqualified'::text
--         ])))
--
-- Why UNION (not REPLACE): public.leads is shared between System 2 (admin-homes
-- + walliam routes, 8 quality writers patched in this commit) and System 1
-- (app/api/chat/*, 6 quality writers in 4 files -- UNTOUCHED per System 1
-- Isolation rule). A replacement CHECK would 500 every System 1 lead insert
-- post-migration. Union CHECK preserves System 1 compatibility while permitting
-- the new System 2 qualification taxonomy.
--
-- Default before: 'cold'::text
-- Default after:  'unqualified'::text
-- (System 2 inserts default to the new value; legacy System 1 inserts continue
-- writing 'hot' explicitly which remains in the allowed set.)
--
-- Backfill: existing 163 rows are ALL in WALLiam tenant (b16e1039) per recon
-- probe 5 -- System 1 has never inserted a row. So the backfill is safe:
--   'hot' (145 rows)  -> 'qualified_hot'
--   'cold' (18 rows)  -> 'unqualified'
--   'warm' (0 rows)   -> 'unqualified' (defensive; recon shows zero)
--   NULL  (0 rows)    -> 'unqualified' (defensive; recon shows zero)
-- Post-backfill distribution: 145 qualified_hot + 18 unqualified = 163.
-- Future System 1 inserts (if any) will write 'hot' which stays in the allowed
-- set; the System 2 admin UI will display them with a default gray badge since
-- 'hot' is not in QUALITY_VALUES.
--
-- Multi-tenant safety: public.leads.tenant_id is NOT NULL; ALTER TABLE acquires
-- ACCESS EXCLUSIVE lock for the duration of the transaction, blocking all
-- concurrent reads/writes. Single transaction = atomic.
--
-- Idempotency: DROP CONSTRAINT IF EXISTS allows safe re-runs. Backfill UPDATEs
-- are no-ops when no rows match old values. The apply runner gates on a pre-
-- state probe and skips the migration entirely if all 7 new values are already
-- in the constraint def.
--
-- Closes F-LEADS-QUALITY-INCONSISTENT from W-LEADS-EMAIL v19.

BEGIN;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_quality_check;

UPDATE public.leads SET quality = 'qualified_hot' WHERE quality = 'hot';
UPDATE public.leads SET quality = 'unqualified'
  WHERE quality NOT IN ('unqualified', 'qualified_hot', 'qualified_cold', 'disqualified',
                        'hot', 'warm', 'cold')
     OR quality IN ('warm', 'cold')
     OR quality IS NULL;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_quality_check
  CHECK (quality = ANY (ARRAY[
    'hot'::text, 'warm'::text, 'cold'::text,
    'unqualified'::text, 'qualified_hot'::text, 'qualified_cold'::text, 'disqualified'::text
  ]));

ALTER TABLE public.leads ALTER COLUMN quality SET DEFAULT 'unqualified';

COMMIT;