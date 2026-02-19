// System 2: Comprehensive Homepage Types
// DO NOT confuse with System 1 (HomePage.tsx / /admin)

export interface GeoAssignment {
  id: string;
  scope: 'all' | 'area' | 'municipality' | 'community';
  area_id: string | null;
  municipality_id: string | null;
  community_id: string | null;
  buildings_access: boolean;
  condo_access: boolean;
  homes_access: boolean;
  is_active: boolean;
}

export interface ResolvedAccess {
  hasAccess: boolean;
  isAllMLS: boolean;
  assignments: GeoAssignment[];
  // Resolved geography IDs (expanded from area/municipality)
  areaIds: string[];
  municipalityIds: string[];
  communityIds: string[];
  // Category permissions (merged  most permissive wins)
  buildings_access: boolean;
  condo_access: boolean;
  homes_access: boolean;
}

export interface MarketStats {
  activeCondos: number;
  activeHomes: number;
  buildingsCount: number;
  avgPsf: number;
  soldThisMonth: number;
  leasedThisMonth: number;
  totalListings: number;
}

export interface AreaCard {
  id: string;
  name: string;
  slug: string;
  type: 'area' | 'municipality' | 'community';
  condoCount: number;
  homeCount: number;
  buildingCount: number;
  avgPsf: number;
  trend: string;
}

export const CONDO_SUBTYPES = [
  'Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
  'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment'
];

export const HOMES_SUBTYPES = [
  'Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
  'Duplex', 'Triplex', 'Fourplex', 'Multiplex'
];
