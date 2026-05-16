-- W-QUALITY-SPLIT (2026-05-16)
-- Separates the conflated `quality` enum into two orthogonal dimensions:
--   quality      = qualification status (qualified | unqualified | disqualified)
--   temperature  = motivation/readiness (hot | warm | cold) -- NULL allowed
--
-- Legacy CHECK already permits 'hot','warm','cold','qualified_hot','qualified_cold','unqualified','disqualified'.
-- This migration:
--   1. Loosens CHECK to ALSO permit 'qualified' (additive; legacy values still accepted)
--   2. Adds temperature column + CHECK constraint
--   3. Backfills temperature from existing quality (qualified_hot -> hot, qualified_cold -> cold)
--   4. Migrates quality values (qualified_hot/qualified_cold -> qualified)
--   5. Adds idx_leads_temperature
--
-- System 1 (legacy condoleads admin/dashboard) files are NOT modified. The visible
-- consequence is that 141 leads currently displayed as `qualified_hot`/`qualified_cold`
-- in System 1 admin/dashboard will now display as `qualified`. System 1 read filters
-- for `'hot'/'warm'/'cold'` quality have always returned 0 (no such rows exist) and
-- continue to return 0 after this migration. No System 1 write paths are broken because
-- the CHECK constraint remains liberal.

BEGIN;

-- 1. Loosen the quality CHECK to permit the clean 'qualified' value alongside all existing values.
ALTER TABLE public.leads DROP CONSTRAINT leads_quality_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_quality_check
  CHECK (quality = ANY (ARRAY[
    'hot'::text,
    'warm'::text,
    'cold'::text,
    'unqualified'::text,
    'qualified_hot'::text,
    'qualified_cold'::text,
    'disqualified'::text,
    'qualified'::text
  ]));

-- 2. Add the temperature column (nullable).
ALTER TABLE public.leads ADD COLUMN temperature text;

ALTER TABLE public.leads ADD CONSTRAINT leads_temperature_check
  CHECK (temperature IS NULL OR temperature = ANY (ARRAY['hot'::text, 'warm'::text, 'cold'::text]));

-- 3. Backfill temperature from the conflated legacy quality values.
UPDATE public.leads SET temperature = 'hot'  WHERE quality = 'qualified_hot';
UPDATE public.leads SET temperature = 'cold' WHERE quality = 'qualified_cold';

-- 4. Migrate quality to the clean qualification-only enum.
--    'unqualified' and 'disqualified' remain as-is.
UPDATE public.leads SET quality = 'qualified'
  WHERE quality IN ('qualified_hot', 'qualified_cold');

-- 5. Index for temperature filter performance.
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON public.leads(temperature);

COMMIT;