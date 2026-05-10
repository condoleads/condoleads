-- W-LEADS-EMAIL T2a — typed origin geo columns on leads
-- Anchors OD-2 = (b): multiple typed columns for origin metadata.
-- FK targets verified at T2a-pre probe (2026-05-10):
--   area  → treb_areas(id) uuid NOT NULL
--   municipality → municipalities(id) uuid NOT NULL
--   community → communities(id) uuid NOT NULL
--   neighbourhood → neighbourhoods(id) uuid NOT NULL
-- ON DELETE behavior: no cascade clause (default NO ACTION / RESTRICT)
-- matches existing leads_building_id_fkey + leads_listing_id_fkey convention.
-- Geo rows can't be deleted while leads reference them; leads stay intact.

BEGIN;

ALTER TABLE leads ADD COLUMN area_id uuid NULL;
ALTER TABLE leads ADD COLUMN municipality_id uuid NULL;
ALTER TABLE leads ADD COLUMN community_id uuid NULL;
ALTER TABLE leads ADD COLUMN neighbourhood_id uuid NULL;

ALTER TABLE leads ADD CONSTRAINT leads_area_id_fkey
  FOREIGN KEY (area_id) REFERENCES treb_areas(id);
ALTER TABLE leads ADD CONSTRAINT leads_municipality_id_fkey
  FOREIGN KEY (municipality_id) REFERENCES municipalities(id);
ALTER TABLE leads ADD CONSTRAINT leads_community_id_fkey
  FOREIGN KEY (community_id) REFERENCES communities(id);
ALTER TABLE leads ADD CONSTRAINT leads_neighbourhood_id_fkey
  FOREIGN KEY (neighbourhood_id) REFERENCES neighbourhoods(id);

CREATE INDEX idx_leads_area_id ON leads (area_id) WHERE area_id IS NOT NULL;
CREATE INDEX idx_leads_municipality_id ON leads (municipality_id) WHERE municipality_id IS NOT NULL;
CREATE INDEX idx_leads_community_id ON leads (community_id) WHERE community_id IS NOT NULL;
CREATE INDEX idx_leads_neighbourhood_id ON leads (neighbourhood_id) WHERE neighbourhood_id IS NOT NULL;

COMMIT;