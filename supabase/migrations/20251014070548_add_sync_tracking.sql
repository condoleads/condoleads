-- Migration: Add sync tracking for incremental updates
-- Author: Admin
-- Date: 2025-01-14
-- Description: Add is_current and last_seen_at to mls_listings, create sync_logs table, add sync settings to buildings

-- ==============================================
-- UP MIGRATION (Apply Changes)
-- ==============================================

BEGIN;

-- 1. Add tracking columns to mls_listings
ALTER TABLE mls_listings 
ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_mls_listings_is_current ON mls_listings(is_current);
CREATE INDEX IF NOT EXISTS idx_mls_listings_last_seen ON mls_listings(last_seen_at DESC);

-- 2. Create sync_logs table
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
  sync_type VARCHAR(20) CHECK (sync_type IN ('initial', 'incremental', 'manual')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  changes_detected JSONB DEFAULT '{}'::jsonb,
  listings_added INTEGER DEFAULT 0,
  listings_updated INTEGER DEFAULT 0,
  listings_removed INTEGER DEFAULT 0,
  status VARCHAR(20) CHECK (status IN ('success', 'failed', 'running')) DEFAULT 'running',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for sync_logs
CREATE INDEX IF NOT EXISTS idx_sync_logs_building ON sync_logs(building_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created ON sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);

-- 3. Add sync settings to buildings table
ALTER TABLE buildings 
ADD COLUMN IF NOT EXISTS auto_sync_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sync_frequency VARCHAR(20) DEFAULT 'daily' CHECK (sync_frequency IN ('hourly', 'daily', 'weekly', 'manual'));

-- Create index for buildings needing sync
CREATE INDEX IF NOT EXISTS idx_buildings_auto_sync ON buildings(auto_sync_enabled, sync_frequency) WHERE auto_sync_enabled = true;

COMMIT;

-- ==============================================
-- DOWN MIGRATION (Rollback - Keep for reference)
-- ==============================================
-- Run these manually if you need to rollback
-- 
-- BEGIN;
-- ALTER TABLE mls_listings DROP COLUMN IF EXISTS is_current;
-- ALTER TABLE mls_listings DROP COLUMN IF EXISTS last_seen_at;
-- DROP INDEX IF EXISTS idx_mls_listings_is_current;
-- DROP INDEX IF EXISTS idx_mls_listings_last_seen ON mls_listings(last_seen_at DESC);
-- DROP TABLE IF EXISTS sync_logs CASCADE;
-- ALTER TABLE buildings DROP COLUMN IF EXISTS auto_sync_enabled;
-- ALTER TABLE buildings DROP COLUMN IF EXISTS sync_frequency;
-- DROP INDEX IF EXISTS idx_buildings_auto_sync;
-- COMMIT;