-- BULK GEOGRAPHIC INSERT FROM PROPTX
-- Generated: 2026-01-04 06:07:14

-- STEP 1: INSERT AREAS
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Brant', 'Brant', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Brant');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Brantford', 'Brantford', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Brantford');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Bruce', 'Bruce', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Bruce');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Canada', 'Canada', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Canada');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Chatham-Kent', 'Chatham-Kent', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Chatham-Kent');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Dufferin', 'Dufferin', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Dufferin');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Durham', 'Durham', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Durham');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Elgin', 'Elgin', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Elgin');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Essex', 'Essex', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Essex');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Frontenac', 'Frontenac', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Frontenac');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Grey County', 'Grey County', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Grey County');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Haldimand', 'Haldimand', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Haldimand');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Halton', 'Halton', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Halton');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Hamilton', 'Hamilton', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Hamilton');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Hastings', 'Hastings', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Hastings');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Kawartha Lakes', 'Kawartha Lakes', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Kawartha Lakes');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Lambton', 'Lambton', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Lambton');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Lanark', 'Lanark', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Lanark');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Leeds and Grenville', 'Leeds and Grenville', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Leeds and Grenville');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Lennox & Addington', 'Lennox & Addington', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Lennox & Addington');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Middlesex', 'Middlesex', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Middlesex');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Muskoka', 'Muskoka', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Muskoka');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Niagara', 'Niagara', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Niagara');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Nipissing', 'Nipissing', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Nipissing');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Norfolk', 'Norfolk', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Norfolk');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Northumberland', 'Northumberland', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Northumberland');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Other Country', 'Other Country', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Other Country');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Ottawa', 'Ottawa', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Ottawa');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Oxford', 'Oxford', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Oxford');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Parry Sound', 'Parry Sound', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Parry Sound');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Peel', 'Peel', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Peel');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Perth', 'Perth', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Perth');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Peterborough', 'Peterborough', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Peterborough');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Prescott and Russell', 'Prescott and Russell', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Prescott and Russell');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Prince Edward County', 'Prince Edward County', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Prince Edward County');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Renfrew', 'Renfrew', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Renfrew');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Simcoe', 'Simcoe', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Simcoe');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Stormont, Dundas and Glengarry', 'Stormont, Dundas and Glengarry', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Stormont, Dundas and Glengarry');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Toronto', 'Toronto', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Toronto');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Waterloo', 'Waterloo', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Waterloo');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'Wellington', 'Wellington', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'Wellington');
INSERT INTO treb_areas (name, code, is_active, discovery_status) SELECT 'York', 'York', true, 'not_started' WHERE NOT EXISTS (SELECT 1 FROM treb_areas WHERE name = 'York');


