-- Snapshot BEFORE W-HOUSE-ACCOUNT UNIT 3 (retire Aily seed root).
-- Restore via: psql -f <this file>  (executes the inverse UPDATEs).

UPDATE agents SET parent_id = NULL, is_active = true WHERE id = '0b3fcbf7-1876-4433-932a-4af5c20daa3f';  -- aily: Admin Tenant (Aily
UPDATE agents SET parent_id = '3c17dc80-82cb-4945-a50e-074639f07a56', is_active = true WHERE id = '28fee333-2741-41d9-bb69-3ab2d803fc51';  -- aily: Agent (Aily)
UPDATE agents SET parent_id = '0b3fcbf7-1876-4433-932a-4af5c20daa3f', is_active = true WHERE id = '3c17dc80-82cb-4945-a50e-074639f07a56';  -- aily: Manager (Aily)
UPDATE agents SET parent_id = '0b3fcbf7-1876-4433-932a-4af5c20daa3f', is_active = true WHERE id = '319ad339-f031-43af-b036-be06bd5221b3';  -- aily: OVAIS QASSIM
-- walliam baseline: King Shah -> parent_id NULL, is_active true  (must be unchanged)
-- walliam baseline: Neo Smith -> parent_id 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe', is_active true  (must be unchanged)
-- walliam baseline: WALLiam -> parent_id 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe', is_active true  (must be unchanged)
