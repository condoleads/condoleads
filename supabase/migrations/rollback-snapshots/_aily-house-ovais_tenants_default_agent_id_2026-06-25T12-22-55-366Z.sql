-- Snapshot BEFORE setting Aily default_agent_id = Ovais (W-HOUSE-ACCOUNT UNIT 1 / F1).
-- Restore via: psql -f <this file>

UPDATE tenants SET default_agent_id = '0b3fcbf7-1876-4433-932a-4af5c20daa3f' WHERE id = 'e2619717-6401-4159-8d4c-d5f87651c8d6';
