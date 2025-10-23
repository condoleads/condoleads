// app/api/admin/buildings/incremental-sync/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PROPTX_API_URL = process.env.PROPTX_RESO_API_URL!;
const PROPTX_TOKEN = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_BEARER_TOKEN!;

export async function POST(request: NextRequest) {
  try {
    const { buildingId } = await request.json();

    if (!buildingId) {
      return NextResponse.json(
        { error: 'Building ID required' },
        { status: 400 }
      );
    }

    console.log(`🔄 Starting incremental sync for building: ${buildingId}`);

    // Get building details
    const { data: building, error: buildingError } = await supabase
      .from('buildings')
      .select('*')
      .eq('id', buildingId)
      .single();

    if (buildingError || !building) {
      throw new Error('Building not found');
    }

    console.log(`🏢 Building: ${building.building_name}`);
    console.log(`📍 Address: ${building.street_number} ${building.street_name}`);

    // Fetch current listings from PropTx using EXACT batch sync logic
    const proptxListings = await fetchPropTxListings(building);

    // Separate active and inactive
    const proptxActive = proptxListings.filter(l =>
      l.StandardStatus === 'Active' || l.MlsStatus === 'Active'
    );
    const proptxInactive = proptxListings.filter(l =>
      l.StandardStatus !== 'Active' && l.MlsStatus !== 'Active'
    );

    console.log(`📊 PropTx: ${proptxActive.length} active, ${proptxInactive.length} inactive`);

    // Get existing listings from DB
    const { data: dbListings } = await supabase
      .from('mls_listings')
      .select('*')
      .eq('building_id', buildingId);

    const dbActive = dbListings?.filter(l =>
      l.standard_status === 'Active' || l.mls_status === 'Active'
    ) || [];
    const dbInactive = dbListings?.filter(l =>
      l.standard_status !== 'Active' && l.mls_status !== 'Active'
    ) || [];

    console.log(`💾 Database: ${dbActive.length} active, ${dbInactive.length} inactive`);

    // OPERATION 1: ACTIVE SYNC
    const activeResults = await syncActiveListings(buildingId, proptxActive, dbActive);

    // OPERATION 2: INACTIVE SYNC
    const inactiveResults = await syncInactiveListings(buildingId, proptxInactive, dbInactive);

    // Update building's last_synced timestamp
    await supabase
      .from('buildings')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_status: 'completed'
      })
      .eq('id', buildingId);

    return NextResponse.json({
      success: true,
      building: building.building_name,
      active: activeResults,
      inactive: inactiveResults,
      message: 'Incremental sync completed'
    });

  } catch (error: any) {
    console.error('❌ Incremental sync failed:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error.message },
      { status: 500 }
    );
  }
}

// EXACT SAME SEARCH LOGIC AS BATCH SYNC
async function fetchPropTxListings(building: any) {
  const streetNumber = building.street_number?.trim();
  const streetName = building.street_name?.trim();
  const city = building.city_district?.trim() || 'Toronto';
  
  if (!streetNumber) {
    throw new Error('Street number is required for search');
  }

  console.log(`🔍 SEARCH STRATEGY - Street Number: ${streetNumber}`);

  let allListings: any[] = [];

  // STRATEGY 1: Active listings (exact street number match)
  console.log('STRATEGY 1: Active listings (street number based)');
  const activeFilter = `StreetNumber eq '${streetNumber}'`;
  const activeUrl = `${PROPTX_API_URL}Property?$filter=${encodeURIComponent(activeFilter)}&$top=5000`;

  try {
    const activeResponse = await fetch(activeUrl, {
      headers: {
        'Authorization': `Bearer ${PROPTX_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    if (activeResponse.ok) {
      const activeData = await activeResponse.json();
      console.log(`  Found ${activeData.value?.length || 0} listings by StreetNumber (includes active)`);
      allListings.push(...(activeData.value || []));
    }
  } catch (error) {
    console.error('❌ Strategy 1 failed:', error);
  }

  // STRATEGY 2+3: Completed transactions (Closed/Sold/Leased)
  console.log('STRATEGY 2+3: Combined search for completed transactions');
  const completedFilter = `StreetNumber eq '${streetNumber}' and (StandardStatus eq 'Closed' or StandardStatus eq 'Sold' or StandardStatus eq 'Leased' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld' or MlsStatus eq 'Leased' or MlsStatus eq 'Lsd')`;
  const completedUrl = `${PROPTX_API_URL}Property?$filter=${encodeURIComponent(completedFilter)}&$top=15000`;

  try {
    const completedResponse = await fetch(completedUrl, {
      headers: {
        'Authorization': `Bearer ${PROPTX_TOKEN}`,
        'Accept': 'application/json'
      }
    });

    if (completedResponse.ok) {
      const completedData = await completedResponse.json();
      console.log(`  Found ${completedData.value?.length || 0} completed transactions total`);
      allListings.push(...(completedData.value || []));
    }
  } catch (error) {
    console.error('❌ Strategy 2+3 failed:', error);
  }

  console.log(`📊 Total raw listings collected: ${allListings.length}`);

  // Remove duplicates by ListingKey
  const uniqueListings = [];
  const seenKeys = new Set();

  allListings.forEach(listing => {
    const key = listing.ListingKey || listing.ListingId || `${listing.StreetNumber}-${listing.UnitNumber}-${listing.MlsStatus}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueListings.push(listing);
    }
  });

  console.log(`  Unique listings after deduplication: ${uniqueListings.length}`);

  // APPLY SAME 3-WAY FILTERING AS BATCH SYNC
  let filteredListings = uniqueListings;

  // Filter 1: Street Number (exact match)
  console.log(`FILTER 1: Street Number = '${streetNumber}'`);
  filteredListings = filteredListings.filter(listing => {
    return listing.StreetNumber === streetNumber;
  });
  console.log(`  After street number filter: ${filteredListings.length} listings`);

  // Filter 2: Street Name (first word match)
  if (streetName && streetName.trim()) {
    const streetFirstWord = streetName.toLowerCase().trim().split(' ')[0];
    console.log(`FILTER 2: Street Name first word = '${streetFirstWord}'`);

    filteredListings = filteredListings.filter(listing => {
      const address = (listing.UnparsedAddress || '').toLowerCase();
      const street = (listing.StreetName || '').toLowerCase();
      return address.includes(streetFirstWord) || street.includes(streetFirstWord);
    });

    console.log(`  After street name filter: ${filteredListings.length} listings`);
  }

  // Filter 3: City (first word match)
  if (city && city.trim()) {
    const cityFirstWord = city.toLowerCase().trim().split(' ')[0];
    console.log(`FILTER 3: City first word = '${cityFirstWord}'`);

    filteredListings = filteredListings.filter(listing => {
      const address = (listing.UnparsedAddress || '').toLowerCase();
      const listingCity = (listing.City || '').toLowerCase();
      return address.includes(cityFirstWord) || listingCity.includes(cityFirstWord);
    });

    console.log(`  After city filter: ${filteredListings.length} listings`);
  }

  // FILTER 4: EXCLUDE UNWANTED STATUSES
  console.log('FILTER 4: Excluding unwanted statuses');
  const excludedStatuses = ['Pending', 'Cancelled', 'Withdrawn'];
  const excludedMlsStatuses = ['Cancelled', 'Withdrawn', 'Pend'];

  const beforeExclusion = filteredListings.length;
  filteredListings = filteredListings.filter(listing => {
    const status = listing.StandardStatus;
    const mlsStatus = listing.MlsStatus;

    if (excludedStatuses.includes(status) || excludedMlsStatuses.includes(mlsStatus)) {
      return false;
    }
    return true;
  });

  console.log(`  After exclusion filter: ${filteredListings.length} listings (removed ${beforeExclusion - filteredListings.length})`);

  return filteredListings;
}

async function syncActiveListings(buildingId: string, proptxActive: any[], dbActive: any[]) {
  const results = {
    updated: 0,
    added: 0,
    removed: 0,
    unchanged: 0
  };

  // SAFETY CHECK: If PropTx returned 0 active listings, don't delete anything!
  if (proptxActive.length === 0 && dbActive.length > 0) {
    console.warn(`⚠️ WARNING: PropTx returned 0 active listings but DB has ${dbActive.length}. Skipping DELETE to prevent data loss!`);
    results.unchanged = dbActive.length;
    return results;
  }

  // Create maps for easy lookup
  const proptxMap = new Map(proptxActive.map(l => [l.ListingKey, l]));
  const dbMap = new Map(dbActive.map(l => [l.listing_key, l]));

  console.log(`🔄 Active Sync: PropTx has ${proptxMap.size}, DB has ${dbMap.size}`);

  // UPDATE: Listings in both (check for changes)
  for (const [listingKey, proptxListing] of proptxMap) {
    const dbListing = dbMap.get(listingKey);

    if (dbListing) {
      // Check if anything changed
      const proptxPrice = parseInt(proptxListing.ListPrice) || 0;
      const dbPrice = dbListing.list_price || 0;
      const statusChanged = proptxListing.StandardStatus !== dbListing.standard_status;
      const priceChanged = proptxPrice !== dbPrice;

      if (statusChanged || priceChanged) {
        // Update the listing
        await supabase
          .from('mls_listings')
          .update({
            list_price: proptxPrice,
            standard_status: proptxListing.StandardStatus,
            mls_status: proptxListing.MlsStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', dbListing.id);

        results.updated++;
        console.log(`✏️ Updated: ${listingKey} (price: ${dbPrice} → ${proptxPrice})`);
      } else {
        results.unchanged++;
      }
    }
  }

  // INSERT: Listings in PropTx but NOT in DB
  for (const [listingKey, proptxListing] of proptxMap) {
    if (!dbMap.has(listingKey)) {
      const mappedListing = mapCompleteDLAFields(proptxListing, buildingId);

      const { error } = await supabase
        .from('mls_listings')
        .insert(mappedListing);

      if (error) {
        console.error(`❌ Failed to add ${listingKey}:`, error);
      } else {
        results.added++;
        console.log(`➕ Added: ${listingKey}`);
      }
    }
  }

  // DELETE: Listings in DB but NOT in PropTx (only if PropTx search was successful)
  if (proptxActive.length > 0) {
    for (const [listingKey, dbListing] of dbMap) {
      if (!proptxMap.has(listingKey)) {
        await supabase
          .from('mls_listings')
          .delete()
          .eq('id', dbListing.id);

        results.removed++;
        console.log(`🗑️ Removed: ${listingKey} (no longer active)`);
      }
    }
  }

  console.log(`✅ Active Results: +${results.added} ✏️${results.updated} 🗑️${results.removed} ⏺️${results.unchanged}`);
  return results;
}

async function syncInactiveListings(buildingId: string, proptxInactive: any[], dbInactive: any[]) {
  const results = {
    added: 0,
    skipped: 0
  };

  const dbMap = new Map(dbInactive.map(l => [l.listing_key, l]));

  console.log(`📥 Inactive Sync: PropTx has ${proptxInactive.length}, DB has ${dbMap.size}`);

  // INSERT ONLY: Add new inactive listings, never delete
  for (const proptxListing of proptxInactive) {
    const listingKey = proptxListing.ListingKey;

    if (!dbMap.has(listingKey)) {
      const mappedListing = mapCompleteDLAFields(proptxListing, buildingId);

      const { error } = await supabase
        .from('mls_listings')
        .insert(mappedListing);

      if (error) {
        console.error(`❌ Failed to add inactive ${listingKey}:`, error);
      } else {
        results.added++;
        console.log(`📥 Added inactive: ${listingKey}`);
      }
    } else {
      results.skipped++;
    }
  }

  console.log(`✅ Inactive Results: +${results.added} ⏭️${results.skipped}`);
  return results;
}

// COMPLETE DLA FIELD MAPPING - ALL 470+ FIELDS
function mapCompleteDLAFields(listing: any, buildingId: string) {
  return {
    // ===== RELATIONSHIP =====
    building_id: buildingId,
    
    // ===== IDENTIFIERS =====
    listing_key: listing.ListingKey || null,
    listing_id: listing.ListingId || listing.ListingID || null,
    originating_system_id: listing.OriginatingSystemID || null,
    originating_system_key: listing.OriginatingSystemKey || null,
    originating_system_name: listing.OriginatingSystemName || null,
    
    // ===== ADDRESS =====
    street_number: listing.StreetNumber || null,
    street_name: listing.StreetName || null,
    street_suffix: listing.StreetSuffix || null,
    street_dir_prefix: listing.StreetDirPrefix || null,
    street_dir_suffix: listing.StreetDirSuffix || null,
    unparsed_address: listing.UnparsedAddress || null,
    city: listing.City || null,
    state_or_province: listing.StateOrProvince || null,
    postal_code: listing.PostalCode || null,
    country: listing.Country || null,
    
    // ===== UNIT =====
    unit_number: listing.UnitNumber || null,
    apartment_number: listing.ApartmentNumber || null,
    legal_apartment_number: listing.LegalApartmentNumber || null,
    legal_stories: listing.LegalStories || null,
    
    // ===== PROPERTY TYPE =====
    property_type: listing.PropertyType || null,
    property_subtype: listing.PropertySubType || null,
    property_use: listing.PropertyUse || null,
    board_property_type: listing.BoardPropertyType || null,
    transaction_type: listing.TransactionType || null,
    
    // ===== PRICING =====
    list_price: parseInteger(listing.ListPrice),
    list_price_unit: listing.ListPriceUnit || null,
    original_list_price: parseInteger(listing.OriginalListPrice),
    original_list_price_unit: listing.OriginalListPriceUnit || null,
    previous_list_price: parseInteger(listing.PreviousListPrice),
    close_price: parseInteger(listing.ClosePrice),
    percent_list_price: listing.PercentListPrice || null,
    prior_price_code: listing.PriorPriceCode || null,
    
    // ===== STATUS =====
    standard_status: listing.StandardStatus || null,
    mls_status: listing.MlsStatus || null,
    prior_mls_status: listing.PriorMlsStatus || null,
    contract_status: listing.ContractStatus || null,
    status_aur: listing.Status_aur || null,
    statis_cause_internal: listing.StatisCauseInternal || null,
    
    // ===== DATES =====
    listing_contract_date: parseDate(listing.ListingContractDate),
    original_entry_timestamp: parseTimestamp(listing.OriginalEntryTimestamp),
    on_market_date: parseDate(listing.OnMarketDate),
    close_date: parseDate(listing.CloseDate),
    purchase_contract_date: parseDate(listing.PurchaseContractDate),
    possession_date: parseDate(listing.PossessionDate),
    expiration_date: parseDate(listing.ExpirationDate),
    conditional_expiry_date: parseDate(listing.ConditionalExpiryDate),
    unavailable_date: parseDate(listing.UnavailableDate),
    suspended_date: parseDate(listing.SuspendedDate),
    terminated_date: parseDate(listing.TerminatedDate),
    
    // ===== TIMESTAMPS =====
    modification_timestamp: parseTimestamp(listing.ModificationTimestamp),
    major_change_timestamp: parseTimestamp(listing.MajorChangeTimestamp),
    price_change_timestamp: parseTimestamp(listing.PriceChangeTimestamp),
    photos_change_timestamp: parseTimestamp(listing.PhotosChangeTimestamp),
    media_change_timestamp: parseTimestamp(listing.MediaChangeTimestamp),
    add_change_timestamp: parseTimestamp(listing.AddChangeTimestamp),
    back_on_market_entry_timestamp: parseTimestamp(listing.BackOnMarketEntryTimestamp),
    sold_entry_timestamp: parseTimestamp(listing.SoldEntryTimestamp),
    sold_conditional_entry_timestamp: parseTimestamp(listing.SoldConditionalEntryTimestamp),
    leased_entry_timestamp: parseTimestamp(listing.LeasedEntryTimestamp),
    leased_conditional_entry_timestamp: parseTimestamp(listing.LeasedConditionalEntryTimestamp),
    deal_fell_through_entry_timestamp: parseTimestamp(listing.DealFellThroughEntryTimestamp),
    extension_entry_timestamp: parseTimestamp(listing.ExtensionEntryTimestamp),
    suspended_entry_timestamp: parseTimestamp(listing.SuspendedEntryTimestamp),
    terminated_entry_timestamp: parseTimestamp(listing.TerminatedEntryTimestamp),
    import_timestamp: parseTimestamp(listing.ImportTimestamp),
    system_modification_timestamp: parseTimestamp(listing.SystemModificationTimestamp),
    timestamp_sql: parseTimestamp(listing.TimestampSQL),
    
    // ===== ROOM COUNTS =====
    bedrooms_total: parseInteger(listing.BedroomsTotal),
    bedrooms_above_grade: parseInteger(listing.BedroomsAboveGrade),
    bedrooms_below_grade: parseInteger(listing.BedroomsBelowGrade),
    main_level_bedrooms: parseInteger(listing.MainLevelBedrooms),
    bathrooms_total_integer: parseDecimal(listing.BathroomsTotalInteger),
    main_level_bathrooms: parseInteger(listing.MainLevelBathrooms),
    kitchens_total: parseInteger(listing.KitchensTotal),
    kitchens_above_grade: parseInteger(listing.KitchensAboveGrade),
    kitchens_below_grade: parseInteger(listing.KitchensBelowGrade),
    number_of_kitchens: listing.NumberOfKitchens || null,
    rooms_total: parseInteger(listing.RoomsTotal),
    rooms_above_grade: parseInteger(listing.RoomsAboveGrade),
    rooms_below_grade: parseInteger(listing.RoomsBelowGrade),
    den_familyroom_yn: parseBoolean(listing.DenFamilyroomYN),
    recreation_room_yn: parseBoolean(listing.RecreationRoomYN),
    
    // ===== SIZE =====
    building_area_total: parseInteger(listing.BuildingAreaTotal),
    building_area_units: listing.BuildingAreaUnits || null,
    living_area_range: listing.LivingAreaRange || null,
    square_foot_source: listing.SquareFootSource || null,
    
    // ===== LOT =====
    lot_size_area: parseDecimal(listing.LotSizeArea),
    lot_size_area_units: listing.LotSizeAreaUnits || null,
    lot_size_dimensions: listing.LotSizeDimensions || null,
    lot_size_units: listing.LotSizeUnits || null,
    lot_size_range_acres: listing.LotSizeRangeAcres || null,
    lot_size_source: listing.LotSizeSource || null,
    lot_width: parseDecimal(listing.LotWidth),
    lot_depth: parseDecimal(listing.LotDepth),
    frontage_length: listing.FrontageLength || null,
    lot_shape: listing.LotShape || null,
    lot_type: listing.LotType || null,
    lot_features: parseJsonArray(listing.LotFeatures),
    lot_irregularities: listing.LotIrregularities || null,
    lot_dimensions_source: listing.LotDimensionsSource || null,
    
    // ===== FEES & TAXES =====
    association_fee: parseDecimal(listing.AssociationFee),
    association_fee_frequency: listing.AssociationFeeFrequency || null,
    association_fee_includes: parseJsonArray(listing.AssociationFeeIncludes),
    additional_monthly_fee: parseDecimal(listing.AdditionalMonthlyFee),
    additional_monthly_fee_frequency: listing.AdditionalMonthlyFeeFrequency || null,
    commercial_condo_fee: parseDecimal(listing.CommercialCondoFee),
    commercial_condo_fee_frequency: listing.CommercialCondoFeeFrequency || null,
    tax_annual_amount: parseDecimal(listing.TaxAnnualAmount),
    tax_year: parseInteger(listing.TaxYear),
    tax_assessed_value: parseInteger(listing.TaxAssessedValue),
    assessment_year: parseInteger(listing.AssessmentYear),
    tax_type: listing.TaxType || null,
    tax_legal_description: listing.TaxLegalDescription || null,
    tax_book_number: listing.TaxBookNumber || null,
    hst_application: parseJsonArray(listing.HSTApplication),
    
    // ===== PARKING =====
    parking_total: parseInteger(listing.ParkingTotal),
    parking_spaces: parseInteger(listing.ParkingSpaces),
    covered_spaces: parseInteger(listing.CoveredSpaces),
    carport_spaces: parseInteger(listing.CarportSpaces),
    garage_parking_spaces: listing.GarageParkingSpaces || null,
    parking_type1: listing.ParkingType1 || null,
    parking_type2: listing.ParkingType2 || null,
    parking_spot1: listing.ParkingSpot1 || null,
    parking_spot2: listing.ParkingSpot2 || null,
    parking_level_unit1: listing.ParkingLevelUnit1 || null,
    parking_level_unit2: listing.ParkingLevelUnit2 || null,
    parking_monthly_cost: parseDecimal(listing.ParkingMonthlyCost),
    parking_features: parseJsonArray(listing.ParkingFeatures),
    attached_garage_yn: parseBoolean(listing.AttachedGarageYN),
    garage_yn: parseBoolean(listing.GarageYN),
    garage_type: listing.GarageType || null,
    trailer_parking_spots: parseInteger(listing.TrailerParkingSpots),
    
    // ===== STORAGE =====
    locker: listing.Locker || null,
    locker_number: listing.LockerNumber || null,
    locker_level: listing.LockerLevel || null,
    locker_unit: listing.LockerUnit || null,
    outside_storage_yn: parseBoolean(listing.OutsideStorageYN),
    
    // ===== UNIT FEATURES =====
    balcony_type: listing.BalconyType || null,
    exposure: listing.Exposure || null,
    direction_faces: listing.DirectionFaces || null,
    view: parseJsonArray(listing.View),
    water_view: parseJsonArray(listing.WaterView),
    ensuite_laundry_yn: parseBoolean(listing.EnsuiteLaundryYN),
    laundry_features: parseJsonArray(listing.LaundryFeatures),
    laundry_level: listing.LaundryLevel || null,
    central_vacuum_yn: parseBoolean(listing.CentralVacuumYN),
    private_entrance_yn: parseBoolean(listing.PrivateEntranceYN),
    handicapped_equipped_yn: parseBoolean(listing.HandicappedEquippedYN),
    accessibility_features: parseJsonArray(listing.AccessibilityFeatures),
    
    // ===== HEATING & COOLING =====
    heat_type: listing.HeatType || null,
    heat_source: listing.HeatSource || null,
    heating_yn: parseBoolean(listing.HeatingYN),
    heating_expenses: parseDecimal(listing.HeatingExpenses),
    cooling: parseJsonArray(listing.Cooling),
    cooling_yn: parseBoolean(listing.CoolingYN),
    
    // ===== UTILITIES =====
    electric_yna: listing.ElectricYNA || null,
    electric_expense: parseDecimal(listing.ElectricExpense),
    electric_on_property_yn: parseBoolean(listing.ElectricOnPropertyYN),
    gas_yna: listing.GasYNA || null,
    water_yna: listing.WaterYNA || null,
    water_expense: parseDecimal(listing.WaterExpense),
    water_meter_yn: parseBoolean(listing.WaterMeterYN),
    cable_yna: listing.CableYNA || null,
    telephone_yna: listing.TelephoneYNA || null,
    sewer_yna: listing.SewerYNA || null,
    utilities: parseJsonArray(listing.Utilities),
    
    // ===== RENTAL =====
    furnished: listing.Furnished || null,
    lease_amount: parseDecimal(listing.LeaseAmount),
    lease_term: listing.LeaseTerm || null,
    minimum_rental_term_months: parseInteger(listing.MinimumRentalTermMonths),
    maximum_rental_months_term: parseInteger(listing.MaximumRentalMonthsTerm),
    rent_includes: parseJsonArray(listing.RentIncludes),
    rental_application_yn: parseBoolean(listing.RentalApplicationYN),
    references_required_yn: parseBoolean(listing.ReferencesRequiredYN),
    credit_check_yn: parseBoolean(listing.CreditCheckYN),
    employment_letter_yn: parseBoolean(listing.EmploymentLetterYN),
    deposit_required: parseBoolean(listing.DepositRequired),
    pets_allowed: parseJsonArray(listing.PetsAllowed),
    lease_agreement_yn: parseBoolean(listing.LeaseAgreementYN),
    leased_terms: listing.LeasedTerms || null,
    lease_to_own_equipment: parseJsonArray(listing.LeaseToOwnEquipment),
    leased_land_fee: parseDecimal(listing.LeasedLandFee),
    buy_option_yn: parseBoolean(listing.BuyOptionYN),
    payment_frequency: listing.PaymentFrequency || null,
    payment_method: listing.PaymentMethod || null,
    portion_lease_comments: listing.PortionLeaseComments || null,
    portion_property_lease: parseJsonArray(listing.PortionPropertyLease),
    
    // ===== DESCRIPTIONS =====
    public_remarks: listing.PublicRemarks || null,
    public_remarks_extras: listing.PublicRemarksExtras || null,
    private_remarks: listing.PrivateRemarks || null,
    inclusions: listing.Inclusions || null,
    exclusions: listing.Exclusions || null,
    chattels_yn: parseBoolean(listing.ChattelsYN),
    rental_items: listing.RentalItems || null,
    
    // ===== POSSESSION =====
    possession_type: listing.PossessionType || null,
    possession_details: listing.PossessionDetails || null,
    condition_of_sale: listing.ConditionOfSale || null,
    escape_clause_yn: parseBoolean(listing.EscapeClauseYN),
    escape_clause_hours: listing.EscapeClauseHours || null,
    assignment_yn: parseBoolean(listing.AssignmentYN),
    vendor_property_info_statement: parseBoolean(listing.VendorPropertyInfoStatement),
    status_certificate_yn: parseBoolean(listing.StatusCertificateYN),
    
    // ===== SHOWING =====
    showing_requirements: parseJsonArray(listing.ShowingRequirements),
    showing_appointments: listing.ShowingAppointments || null,
    sign_on_property_yn: parseBoolean(listing.SignOnPropertyYN),
    access_to_property: parseJsonArray(listing.AccessToProperty),
    contact_after_expiry_yn: parseBoolean(listing.ContactAfterExpiryYN),
    permission_to_contact_listing_broker_to_advertise: parseBoolean(listing.PermissionToContactListingBrokerToAdvertise),
    
    // ===== LOCATION =====
    directions: listing.Directions || null,
    cross_street: listing.CrossStreet || null,
    city_region: listing.CityRegion || null,
    county_or_parish: listing.CountyOrParish || null,
    out_of_area_municipality: listing.OutOfAreaMunicipality || null,
    map_page: listing.MapPage || null,
    map_column: parseInteger(listing.MapColumn),
    map_row: listing.MapRow || null,
    town: listing.Town || null,
    mls_area_district_old_zone: listing.MLSAreaDistrictOldZone || null,
    mls_area_district_toronto: listing.MLSAreaDistrictToronto || null,
    mls_area_municipality_district: listing.MLSAreaMunicipalityDistrict || null,
    
    // ===== BUILDING INFO =====
    building_name: listing.BuildingName || null,
    business_name: listing.BusinessName || null,
    association_name: listing.AssociationName || null,
    association_yn: parseBoolean(listing.AssociationYN),
    association_amenities: parseJsonArray(listing.AssociationAmenities),
    condo_corp_number: parseInteger(listing.CondoCorpNumber),
    property_management_company: listing.PropertyManagementCompany || null,
    number_shares_percent: listing.NumberSharesPercent || null,
    
    // ===== CONSTRUCTION =====
    new_construction_yn: parseBoolean(listing.NewConstructionYN),
    approximate_age: listing.ApproximateAge || null,
    construction_materials: parseJsonArray(listing.ConstructionMaterials),
    architectural_style: parseJsonArray(listing.ArchitecturalStyle),
    structure_type: parseJsonArray(listing.StructureType),
    foundation_details: parseJsonArray(listing.FoundationDetails),
    roof: parseJsonArray(listing.Roof),
    exterior_features: parseJsonArray(listing.ExteriorFeatures),
    
    // ===== INTERIOR =====
    interior_features: parseJsonArray(listing.InteriorFeatures),
    fireplace_yn: parseBoolean(listing.FireplaceYN),
    fireplaces_total: parseInteger(listing.FireplacesTotal),
    fireplace_features: parseJsonArray(listing.FireplaceFeatures),
    basement: parseJsonArray(listing.Basement),
    basement_yn: parseBoolean(listing.BasementYN),
    uffi: listing.UFFI || null,
    elevator_type: listing.ElevatorType || null,
    elevator_yn: parseBoolean(listing.ElevatorYN),
    exercise_room_gym: listing.ExerciseRoomGym || null,
    
    // ===== SPECIAL FEATURES =====
    pool_features: parseJsonArray(listing.PoolFeatures),
    spa_yn: parseBoolean(listing.SpaYN),
    sauna_yn: parseBoolean(listing.SaunaYN),
    squash_racquet: listing.SquashRacquet || null,
    waterfront_yn: parseBoolean(listing.WaterfrontYN),
    waterfront: parseJsonArray(listing.Waterfront),
    waterfront_features: parseJsonArray(listing.WaterfrontFeatures),
    waterfront_accessory: parseJsonArray(listing.WaterfrontAccessory),
    water_body_name: listing.WaterBodyName || null,
    water_body_type: listing.WaterBodyType || null,
    water_frontage_ft: listing.WaterFrontageFt || null,
    island_yn: parseBoolean(listing.IslandYN),
    shoreline: parseJsonArray(listing.Shoreline),
    shoreline_allowance: listing.ShorelineAllowance || null,
    shoreline_exposure: listing.ShorelineExposure || null,
    
    // ===== COMMERCIAL =====
    business_type: parseJsonArray(listing.BusinessType),
    franchise_yn: parseBoolean(listing.FranchiseYN),
    freestanding_yn: parseBoolean(listing.FreestandingYN),
    liquor_license_yn: parseBoolean(listing.LiquorLicenseYN),
    seating_capacity: parseInteger(listing.SeatingCapacity),
    number_of_full_time_employees: parseInteger(listing.NumberOfFullTimeEmployees),
    hours_days_of_operation: parseJsonArray(listing.HoursDaysOfOperation),
    hours_days_of_operation_description: listing.HoursDaysOfOperationDescription || null,
    
    // ===== INDUSTRIAL =====
    industrial_area: parseDecimal(listing.IndustrialArea),
    industrial_area_code: listing.IndustrialAreaCode || null,
    office_apartment_area: parseDecimal(listing.OfficeApartmentArea),
    office_apartment_area_unit: listing.OfficeApartmentAreaUnit || null,
    retail_area: parseDecimal(listing.RetailArea),
    retail_area_code: listing.RetailAreaCode || null,
    percent_building: listing.PercentBuilding || null,
    clear_height_feet: parseInteger(listing.ClearHeightFeet),
    clear_height_inches: parseInteger(listing.ClearHeightInches),
    bay_size_length_feet: parseInteger(listing.BaySizeLengthFeet),
    bay_size_length_inches: parseInteger(listing.BaySizeLengthInches),
    bay_size_width_feet: parseInteger(listing.BaySizeWidthFeet),
    bay_size_width_inches: parseInteger(listing.BaySizeWidthInches),
    crane_yn: parseBoolean(listing.CraneYN),
    rail: listing.Rail || null,
    docking_type: parseJsonArray(listing.DockingType),
    
    // ===== SHIPPING DOORS =====
    double_man_shipping_doors: parseInteger(listing.DoubleManShippingDoors),
    double_man_shipping_doors_height_feet: parseInteger(listing.DoubleManShippingDoorsHeightFeet),
    double_man_shipping_doors_height_inches: parseInteger(listing.DoubleManShippingDoorsHeightInches),
    double_man_shipping_doors_width_feet: parseInteger(listing.DoubleManShippingDoorsWidthFeet),
    double_man_shipping_doors_width_inches: parseInteger(listing.DoubleManShippingDoorsWidthInches),
    drive_in_level_shipping_doors: parseInteger(listing.DriveInLevelShippingDoors),
    drive_in_level_shipping_doors_height_feet: parseInteger(listing.DriveInLevelShippingDoorsHeightFeet),
    drive_in_level_shipping_doors_height_inches: parseInteger(listing.DriveInLevelShippingDoorsHeightInches),
    drive_in_level_shipping_doors_width_feet: parseInteger(listing.DriveInLevelShippingDoorsWidthFeet),
    drive_in_level_shipping_doors_width_inches: parseInteger(listing.DriveInLevelShippingDoorsWidthInches),
    grade_level_shipping_doors: parseInteger(listing.GradeLevelShippingDoors),
    grade_level_shipping_doors_height_feet: parseInteger(listing.GradeLevelShippingDoorsHeightFeet),
    grade_level_shipping_doors_height_inches: parseInteger(listing.GradeLevelShippingDoorsHeightInches),
    grade_level_shipping_doors_width_feet: parseInteger(listing.GradeLevelShippingDoorsWidthFeet),
    grade_level_shipping_doors_width_inches: parseInteger(listing.GradeLevelShippingDoorsWidthInches),
    truck_level_shipping_doors: parseInteger(listing.TruckLevelShippingDoors),
    truck_level_shipping_doors_height_feet: parseInteger(listing.TruckLevelShippingDoorsHeightFeet),
    truck_level_shipping_doors_height_inches: parseInteger(listing.TruckLevelShippingDoorsHeightInches),
    truck_level_shipping_doors_width_feet: parseInteger(listing.TruckLevelShippingDoorsWidthFeet),
    truck_level_shipping_doors_width_inches: parseInteger(listing.TruckLevelShippingDoorsWidthInches),
    
    // ===== ELECTRICAL =====
    amps: parseInteger(listing.Amps),
    volts: parseInteger(listing.Volts),
    
    // ===== FINANCIAL =====
    gross_revenue: parseDecimal(listing.GrossRevenue),
    net_operating_income: parseDecimal(listing.NetOperatingIncome),
    operating_expense: parseDecimal(listing.OperatingExpense),
    total_expenses: listing.TotalExpenses || null,
    expenses: listing.Expenses || null,
    year_expenses: parseDecimal(listing.YearExpenses),
    insurance_expense: parseDecimal(listing.InsuranceExpense),
    maintenance_expense: parseDecimal(listing.MaintenanceExpense),
    professional_management_expense: parseDecimal(listing.ProfessionalManagementExpense),
    other_expense: parseDecimal(listing.OtherExpense),
    taxes_expense: parseDecimal(listing.TaxesExpense),
    vacancy_allowance: parseDecimal(listing.VacancyAllowance),
    financial_statement_available_yn: parseBoolean(listing.FinancialStatementAvailableYN),
    estimated_inventory_value_at_cost: parseDecimal(listing.EstimatedInventoryValueAtCost),
    percent_rent: parseDecimal(listing.PercentRent),
    common_area_upcharge: parseDecimal(listing.CommonAreaUpcharge),
    tmi: listing.TMI || null,
    
    // ===== LAND/RURAL =====
    farm_type: parseJsonArray(listing.FarmType),
    farm_features: parseJsonArray(listing.FarmFeatures),
    soil_type: parseJsonArray(listing.SoilType),
    soil_test: listing.SoilTest || null,
    soil_evaluation: listing.SoilEvaluation || null,
    topography: parseJsonArray(listing.Topography),
    vegetation: parseJsonArray(listing.Vegetation),
    rural_utilities: parseJsonArray(listing.RuralUtilities),
    water_source: parseJsonArray(listing.WaterSource),
    water_delivery_feature: parseJsonArray(listing.WaterDeliveryFeature),
    water_delivery: listing.WaterDelivery || null,
    well_depth: parseDecimal(listing.WellDepth),
    well_capacity: parseDecimal(listing.WellCapacity),
    sewage: parseJsonArray(listing.Sewage),
    sewer: parseJsonArray(listing.Sewer),
    water: listing.Water || null,
    winterized: listing.Winterized || null,
    
    // ===== ENVIRONMENTAL =====
    energy_certificate: parseBoolean(listing.EnergyCertificate),
    green_certification_level: listing.GreenCertificationLevel || null,
    green_property_information_statement: parseBoolean(listing.GreenPropertyInformationStatement),
    alternative_power: parseJsonArray(listing.AlternativePower),
    security_features: parseJsonArray(listing.SecurityFeatures),
    
    // ===== LEGAL =====
    parcel_number: listing.ParcelNumber || null,
    parcel_number2: listing.ParcelNumber2 || null,
    roll_number: listing.RollNumber || null,
    zoning: listing.Zoning || null,
    zoning_designation: listing.ZoningDesignation || null,
    survey_available_yn: parseBoolean(listing.SurveyAvailableYN),
    survey_type: listing.SurveyType || null,
    easements_restrictions: parseJsonArray(listing.EasementsRestrictions),
    disclosures: parseJsonArray(listing.Disclosures),
    local_improvements: parseBoolean(listing.LocalImprovements),
    local_improvements_comments: listing.LocalImprovementsComments || null,
    development_charges_paid: parseJsonArray(listing.DevelopmentChargesPaid),
    parcel_of_tied_land: listing.ParcelOfTiedLand || null,
    parcel_of_tied_land_old: listing.ParcelOfTiedLandOld || null,
    road_access_fee: parseDecimal(listing.RoadAccessFee),
    
    // ===== BROKERAGE =====
    list_office_key: listing.ListOfficeKey || null,
    list_office_name: listing.ListOfficeName || null,
    list_agent_key: listing.ListAgentKey || null,
    list_agent_full_name: listing.ListAgentFullName || null,
    list_agent_direct_phone: listing.ListAgentDirectPhone || null,
    list_agent_office_phone: listing.ListAgentOfficePhone || null,
    list_aor: listing.ListAOR || null,
    list_agent_aor: listing.ListAgentAOR || null,
    list_office_aor: listing.ListOfficeAOR || null,
    main_office_key: listing.MainOfficeKey || null,
    co_list_office_key: listing.CoListOfficeKey || null,
    co_list_office_name: listing.CoListOfficeName || null,
    co_list_agent_key: listing.CoListAgentKey || null,
    co_list_agent_full_name: listing.CoListAgentFullName || null,
    co_list_agent_aor: listing.CoListAgentAOR || null,
    co_list_office_phone: listing.CoListOfficePhone || null,
    co_list_agent3_full_name: listing.CoListAgent3FullName || null,
    co_list_agent3_key: listing.CoListAgent3Key || null,
    co_list_office_key3: listing.CoListOfficeKey3 || null,
    co_list_office_name3: listing.CoListOfficeName3 || null,
    co_list_agent4_full_name: listing.CoListAgent4FullName || null,
    co_list_agent4_key: listing.CoListAgent4Key || null,
    co_list_office_key4: listing.CoListOfficeKey4 || null,
    co_list_office_name4: listing.CoListOfficeName4 || null,
    buyer_office_name: listing.BuyerOfficeName || null,
    co_buyer_office_name: listing.CoBuyerOfficeName || null,
    co_buyer_office_name3: listing.CoBuyerOfficeName3 || null,
    co_buyer_office_name4: listing.CoBuyerOfficeName4 || null,
    broker_fax_number: listing.BrokerFaxNumber || null,
    transaction_broker_compensation: listing.TransactionBrokerCompensation || null,
    firm_key: listing.FirmKey || null,
    employer_id: listing.EmployerID || null,
    
    // ===== MEDIA REFERENCES =====
    virtual_tour_url_unbranded: listing.VirtualTourURLUnbranded || null,
    virtual_tour_url_unbranded2: listing.VirtualTourURLUnbranded2 || null,
    virtual_tour_url_branded: listing.VirtualTourURLBranded || null,
    virtual_tour_url_branded2: listing.VirtualTourURLBranded2 || null,
    virtual_tour_flag_yn: parseBoolean(listing.VirtualTourFlagYN),
    sales_brochure_url: listing.SalesBrochureUrl || null,
    sound_bite_url: listing.SoundBiteUrl || null,
    additional_pictures_url: listing.AdditionalPicturesUrl || null,
    alternate_feature_sheet: listing.AlternateFeatureSheet || null,
    media_listing_key: listing.MediaListingKey || null,
    old_photo_instructions: listing.OldPhotoInstructions || null,
    image_width: parseInteger(listing.ImageWidth),
    image_height: parseInteger(listing.ImageHeight),
    
    // ===== INTERNET =====
    internet_entire_listing_display_yn: parseBoolean(listing.InternetEntireListingDisplayYN),
    internet_address_display_yn: parseBoolean(listing.InternetAddressDisplayYN),
    ddf_yn: parseBoolean(listing.DDFYN),
    picture_yn: parseBoolean(listing.PictureYN),
    
    // ===== SPECIAL =====
    fractional_ownership_yn: parseBoolean(listing.FractionalOwnershipYN),
    seasonal_dwelling: parseBoolean(listing.SeasonalDwelling),
    senior_community_yn: parseBoolean(listing.SeniorCommunityYN),
    property_attached_yn: parseBoolean(listing.PropertyAttachedYN),
    under_contract: parseJsonArray(listing.UnderContract),
    special_designation: parseJsonArray(listing.SpecialDesignation),
    community_features: parseJsonArray(listing.CommunityFeatures),
    property_features: parseJsonArray(listing.PropertyFeatures),
    other_structures: parseJsonArray(listing.OtherStructures),
    holdover_days: parseInteger(listing.HoldoverDays),
    occupant_type: listing.OccupantType || null,
    ownership_type: listing.OwnershipType || null,
    room_height: parseDecimal(listing.RoomHeight),
    
    // ===== LINKING =====
    link_yn: parseBoolean(listing.LinkYN),
    link_property: listing.LinkProperty || null,
    
    // ===== YEAR LEASE =====
    year1_lease_price: listing.Year1LeasePrice || null,
    year1_lease_price_hold: listing.Year1LeasePriceHold || null,
    year2_lease_price: listing.Year2LeasePrice || null,
    year2_lease_price_hold: listing.Year2LeasePriceHold || null,
    year3_lease_price: listing.Year3LeasePrice || null,
    year3_lease_price_hold: listing.Year3LeasePriceHold || null,
    year4_lease_price: listing.Year4LeasePrice || null,
    year4_lease_price_hold: listing.Year4LeasePriceHold || null,
    year5_lease_price: listing.Year5LeasePrice || null,
    year5_lease_price_hold: listing.Year5LeasePriceHold || null,
    
    // ===== ROOM TYPE =====
    room_type: parseJsonArray(listing.RoomType),
    
    // ===== WASHROOMS =====
    washrooms_type1: parseInteger(listing.WashroomsType1),
    washrooms_type1_level: listing.WashroomsType1Level || null,
    washrooms_type1_pcs: parseInteger(listing.WashroomsType1Pcs),
    washrooms_type2: parseInteger(listing.WashroomsType2),
    washrooms_type2_level: listing.WashroomsType2Level || null,
    washrooms_type2_pcs: parseInteger(listing.WashroomsType2Pcs),
    washrooms_type3: parseInteger(listing.WashroomsType3),
    washrooms_type3_level: listing.WashroomsType3Level || null,
    washrooms_type3_pcs: parseInteger(listing.WashroomsType3Pcs),
    washrooms_type4: parseInteger(listing.WashroomsType4),
    washrooms_type4_level: listing.WashroomsType4Level || null,
    washrooms_type4_pcs: parseInteger(listing.WashroomsType4Pcs),
    washrooms_type5: parseInteger(listing.WashroomsType5),
    washrooms_type5_level: listing.WashroomsType5Level || null,
    washrooms_type5_pcs: parseInteger(listing.WashroomsType5Pcs),
    
    // ===== STAFF =====
    staff_comments: listing.StaffComments || null,
    channel_name: listing.ChannelName || null,
    
    // ===== DAYS ON MARKET =====
    days_on_market: parseInteger(listing.DaysOnMarket),
    
    // ===== SOLD FIELDS =====
    sold_area: listing.SoldArea || null,
    sold_area_code: listing.SoldAreaCode || null,
    sold_area_units: listing.SoldAreaUnits || null,
    close_date_hold: parseDate(listing.CloseDateHold),
    close_price_hold: parseInteger(listing.ClosePriceHold),
    
    // ===== ADDITIONAL FIELDS =====
    long_description: listing.LongDescription || null,
    short_description: listing.ShortDescription || null,
    possession_date_old: parseDate(listing.PossessionDateOld),
    disclose_after_closing_date: listing.DiscloseAfterClosingDate || null,
    do_not_disclose_until_closing_yn: parseBoolean(listing.DoNotDiscloseUntilClosingYN),
    permission: parseJsonArray(listing.Permission),
    tax_id: listing.TaxID || null,
    source_system_id: listing.SourceSystemID || null,
    source_system_name: listing.SourceSystemName || null,
    uid: listing.UID || null,
    
    // ===== ACCESS CONTROL FLAGS =====
    available_in_idx: determineIDXAccess(listing),
    available_in_vow: determineVOWAccess(listing),
    available_in_dla: true,
    
    // ===== TRACKING =====
    is_current: true,
    last_seen_at: new Date().toISOString(),
    last_modified_at: parseTimestamp(listing.ModificationTimestamp) || new Date().toISOString(),
    
    // ===== SYSTEM =====
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    sync_source: 'incremental'
  };
}

// Access control logic
function determineIDXAccess(listing: any): boolean {
  return listing.StandardStatus === 'Active' && 
         listing.InternetEntireListingDisplayYN === true;
}

function determineVOWAccess(listing: any): boolean {
  return listing.DDFYN === true;
}

// Helper parsing functions
function parseInteger(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseInt(value.toString());
  return isNaN(parsed) ? null : parsed;
}

function parseDecimal(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(value.toString());
  return isNaN(parsed) ? null : parsed;
}

function parseBoolean(value: any): boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  const str = value.toString().toLowerCase();
  if (str === 'true' || str === 'yes' || str === '1') return true;
  if (str === 'false' || str === 'no' || str === '0') return false;
  return null;
}

function parseDate(value: any): string | null {
  if (!value) return null;
  try {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

function parseTimestamp(value: any): string | null {
  if (!value) return null;
  try {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

function parseJsonArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}