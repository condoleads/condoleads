// lib/admin/complete-save.ts - COMPLETE 523 DLA FIELD MAPPING

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============================================
// MAIN SAVE FUNCTION
// ============================================
export async function saveCompleteBuildingData(
  propTxResults: any,
  buildingId: string
) {
  console.log('?? Starting complete DLA save...');
  
  const stats = {
    listingsCreated: 0,
    mediaCreated: 0,
    roomsCreated: 0,
    openHousesCreated: 0,
    errors: []
  };

  try {
    // Process each listing
    for (const listing of propTxResults.value || []) {
      try {
        // 1. Save listing (459 property fields)
        const listingRecord = mapListingToDatabase(listing, buildingId);
        const { data: savedListing, error: listingError } = await supabase
          .from('mls_listings')
          .insert(listingRecord)
          .select()
          .single();

        if (listingError) throw listingError;
        stats.listingsCreated++;

        // 2. Save media (17 media fields) - TWO VARIANT SYSTEM
        if (listing.Media && Array.isArray(listing.Media)) {
          const filteredMedia = filterToTwoVariants(listing.Media);
          for (const media of filteredMedia) {
            const mediaRecord = mapMediaToDatabase(media, savedListing.id);
            const { error: mediaError } = await supabase
              .from('media')
              .insert(mediaRecord);
            
            if (!mediaError) stats.mediaCreated++;
          }
        }

        // 3. Save rooms (20 room fields)
        if (listing.PropertyRooms && Array.isArray(listing.PropertyRooms)) {
          for (const room of listing.PropertyRooms) {
            const roomRecord = mapRoomToDatabase(room, savedListing.id);
            const { error: roomError } = await supabase
              .from('property_rooms')
              .insert(roomRecord);
            
            if (!roomError) stats.roomsCreated++;
          }
        }

        // 4. Save open houses (8 open house fields)
        if (listing.OpenHouses && Array.isArray(listing.OpenHouses)) {
          for (const openHouse of listing.OpenHouses) {
            const openHouseRecord = mapOpenHouseToDatabase(openHouse, savedListing.id);
            const { error: ohError } = await supabase
              .from('open_houses')
              .insert(openHouseRecord);
            
            if (!ohError) stats.openHousesCreated++;
          }
        }

      } catch (listingError: any) {
        stats.errors.push(`Listing ${listing.ListingKey}: ${listingError.message}`);
      }
    }

    return {
      success: true,
      stats
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      stats
    };
  }
}

// ============================================
// 1. MAP LISTING  mls_listings (459 FIELDS)
// ============================================
function mapListingToDatabase(listing: any, buildingId: string) {
  return {
    // System fields
    building_id: buildingId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
    sync_source: 'dla',
    
    // Access control
    available_in_idx: listing.StandardStatus === 'Active' && listing.InternetEntireListingDisplayYN === true,
    available_in_vow: listing.DDFYN === true,
    available_in_dla: true,
    
    // ALL 459 DLA PROPERTY FIELDS (alphabetical by database field name)
    access_to_property: listing.AccessToProperty || null,
    accessibility_features: Array.isArray(listing.AccessibilityFeatures) ? listing.AccessibilityFeatures : null,
    additional_monthly_fee: parseNumber(listing.AdditionalMonthlyFee),
    additional_monthly_fee_frequency: listing.AdditionalMonthlyFeeFrequency || null,
    additional_pictures_url: listing.AdditionalPicturesUrl || null,
    alternate_feature_sheet: listing.AlternateFeatureSheet || null,
    alternative_power: Array.isArray(listing.AlternativePower) ? listing.AlternativePower : null,
    amps: parseNumber(listing.Amps),
    apartment_number: listing.ApartmentNumber || null,
    approximate_age: listing.ApproximateAge || null,
    architectural_style: Array.isArray(listing.ArchitecturalStyle) ? listing.ArchitecturalStyle : null,
    assessment_year: parseNumber(listing.AssessmentYear),
    assignment_yn: parseBoolean(listing.AssignmentYN),
    association_amenities: Array.isArray(listing.AssociationAmenities) ? listing.AssociationAmenities : null,
    association_fee: parseNumber(listing.AssociationFee),
    association_fee_frequency: listing.AssociationFeeFrequency || null,
    association_fee_includes: Array.isArray(listing.AssociationFeeIncludes) ? listing.AssociationFeeIncludes : null,
    association_name: listing.AssociationName || null,
    association_yn: parseBoolean(listing.AssociationYN),
    attached_garage_yn: parseBoolean(listing.AttachedGarageYN),
    balcony_type: listing.BalconyType || null,
    basement: listing.Basement || null,
    basement_yn: parseBoolean(listing.BasementYN),
    bathrooms_total_integer: parseNumber(listing.BathroomsTotalInteger),
    bay_size_length_feet: parseNumber(listing.BaySizeLengthFeet),
    bay_size_length_inches: parseNumber(listing.BaySizeLengthInches),
    bay_size_width_feet: parseNumber(listing.BaySizeWidthFeet),
    bay_size_width_inches: parseNumber(listing.BaySizeWidthInches),
    bedrooms_above_grade: parseNumber(listing.BedroomsAboveGrade),
    bedrooms_below_grade: parseNumber(listing.BedroomsBelowGrade),
    bedrooms_total: parseNumber(listing.BedroomsTotal),
    board_property_type: listing.BoardPropertyType || null,
    building_area_total: parseNumber(listing.BuildingAreaTotal),
    building_area_units: listing.BuildingAreaUnits || null,
    building_name: listing.BuildingName || null,
    business_name: listing.BusinessName || null,
    business_type: Array.isArray(listing.BusinessType) ? listing.BusinessType : null,
    buy_option_yn: parseBoolean(listing.BuyOptionYN),
    cable_yna: listing.CableYNA || null,
    carport_spaces: parseNumber(listing.CarportSpaces),
    central_vacuum_yn: parseBoolean(listing.CentralVacuumYN),
    channel_name: listing.ChannelName || null,
    chattels_yn: parseBoolean(listing.ChattelsYN),
    city: listing.City || null,
    city_region: listing.CityRegion || null,
    clear_height_feet: parseNumber(listing.ClearHeightFeet),
    clear_height_inches: parseNumber(listing.ClearHeightInches),
    close_date: parseDate(listing.CloseDate),
    close_price: parseNumber(listing.ClosePrice),
    co_list_agent3_full_name: listing.CoListAgent3FullName || null,
    co_list_agent3_key: listing.CoListAgent3Key || null,
    co_list_agent4_full_name: listing.CoListAgent4FullName || null,
    co_list_agent4_key: listing.CoListAgent4Key || null,
    co_list_agent_aor: listing.CoListAgentAOR || null,
    co_list_agent_full_name: listing.CoListAgentFullName || null,
    co_list_agent_key: listing.CoListAgentKey || null,
    co_list_office_key: listing.CoListOfficeKey || null,
    co_list_office_key3: listing.CoListOfficeKey3 || null,
    co_list_office_key4: listing.CoListOfficeKey4 || null,
    co_list_office_name: listing.CoListOfficeName || null,
    co_list_office_name3: listing.CoListOfficeName3 || null,
    co_list_office_name4: listing.CoListOfficeName4 || null,
    co_list_office_phone: listing.CoListOfficePhone || null,
    commercial_condo_fee: parseNumber(listing.CommercialCondoFee),
    commercial_condo_fee_frequency: listing.CommercialCondoFeeFrequency || null,
    common_area_upcharge: parseNumber(listing.CommonAreaUpcharge),
    community_features: Array.isArray(listing.CommunityFeatures) ? listing.CommunityFeatures : null,
    condition_of_sale: listing.ConditionOfSale || null,
    conditional_expiry_date: parseDate(listing.ConditionalExpiryDate),
    condo_corp_number: listing.CondoCorpNumber || null,
    construction_materials: Array.isArray(listing.ConstructionMaterials) ? listing.ConstructionMaterials : null,
    contact_after_expiry_yn: parseBoolean(listing.ContactAfterExpiryYN),
    contract_status: listing.ContractStatus || null,
    cooling: listing.Cooling || null,
    cooling_yn: parseBoolean(listing.CoolingYN),
    country: listing.Country || null,
    county_or_parish: listing.CountyOrParish || null,
    covered_spaces: parseNumber(listing.CoveredSpaces),
    crane_yn: parseBoolean(listing.CraneYN),
    credit_check_yn: parseBoolean(listing.CreditCheckYN),
    cross_street: listing.CrossStreet || null,
    ddf_yn: parseBoolean(listing.DDFYN),
    days_on_market: parseNumber(listing.DaysOnMarket),
    den_familyroom_yn: parseBoolean(listing.DenFamilyroomYN),
    deposit_required: parseBoolean(listing.DepositRequired),
    development_charges_paid: Array.isArray(listing.DevelopmentChargesPaid) ? listing.DevelopmentChargesPaid : null,
    direction_faces: listing.DirectionFaces || null,
    directions: listing.Directions || null,
    disclosures: Array.isArray(listing.Disclosures) ? listing.Disclosures : null,
    docking_type: Array.isArray(listing.DockingType) ? listing.DockingType : null,
    double_man_shipping_doors: parseNumber(listing.DoubleManShippingDoors),
    double_man_shipping_doors_height_feet: parseNumber(listing.DoubleManShippingDoorsHeightFeet),
    double_man_shipping_doors_height_inches: parseNumber(listing.DoubleManShippingDoorsHeightInches),
    double_man_shipping_doors_width_feet: parseNumber(listing.DoubleManShippingDoorsWidthFeet),
    double_man_shipping_doors_width_inches: parseNumber(listing.DoubleManShippingDoorsWidthInches),
    drive_in_level_shipping_doors: parseNumber(listing.DriveInLevelShippingDoors),
    drive_in_level_shipping_doors_height_feet: parseNumber(listing.DriveInLevelShippingDoorsHeightFeet),
    drive_in_level_shipping_doors_height_inches: parseNumber(listing.DriveInLevelShippingDoorsHeightInches),
    drive_in_level_shipping_doors_width_feet: parseNumber(listing.DriveInLevelShippingDoorsWidthFeet),
    drive_in_level_shipping_doors_width_inches: parseNumber(listing.DriveInLevelShippingDoorsWidthInches),
    electric_expense: parseNumber(listing.ElectricExpense),
    electric_on_property_yn: parseBoolean(listing.ElectricOnPropertyYN),
    electric_yna: listing.ElectricYNA || null,
    elevator_type: listing.ElevatorType || null,
    elevator_yn: parseBoolean(listing.ElevatorYN),
    employment_letter_yn: parseBoolean(listing.EmploymentLetterYN),
    energy_certificate: parseBoolean(listing.EnergyCertificate),
    ensuite_laundry_yn: parseBoolean(listing.EnsuiteLaundryYN),
    escape_clause_hours: listing.EscapeClauseHours || null,
    escape_clause_yn: parseBoolean(listing.EscapeClauseYN),
    estimated_inventory_value_at_cost: parseNumber(listing.EstimatedInventoryValueAtCost),
    exclusions: listing.Exclusions || null,
    exercise_room_gym: listing.ExerciseRoomGym || null,
    expenses: listing.Expenses || null,
    expiration_date: parseDate(listing.ExpirationDate),
    exposure: listing.Exposure || null,
    exterior_features: Array.isArray(listing.ExteriorFeatures) ? listing.ExteriorFeatures : null,
    farm_features: Array.isArray(listing.FarmFeatures) ? listing.FarmFeatures : null,
    farm_type: Array.isArray(listing.FarmType) ? listing.FarmType : null,
    financial_statement_available_yn: parseBoolean(listing.FinancialStatementAvailableYN),
    fireplace_features: Array.isArray(listing.FireplaceFeatures) ? listing.FireplaceFeatures : null,
    fireplace_yn: parseBoolean(listing.FireplaceYN),
    fireplaces_total: parseNumber(listing.FireplacesTotal),
    foundation_details: Array.isArray(listing.FoundationDetails) ? listing.FoundationDetails : null,
    fractional_ownership_yn: parseBoolean(listing.FractionalOwnershipYN),
    franchise_yn: parseBoolean(listing.FranchiseYN),
    freestanding_yn: parseBoolean(listing.FreestandingYN),
    frontage_length: listing.FrontageLength || null,
    furnished: listing.Furnished || null,
    garage_parking_spaces: listing.GarageParkingSpaces || null,
    garage_type: listing.GarageType || null,
    garage_yn: parseBoolean(listing.GarageYN),
    gas_yna: listing.GasYNA || null,
    grade_level_shipping_doors: parseNumber(listing.GradeLevelShippingDoors),
    grade_level_shipping_doors_height_feet: parseNumber(listing.GradeLevelShippingDoorsHeightFeet),
    grade_level_shipping_doors_height_inches: parseNumber(listing.GradeLevelShippingDoorsHeightInches),
    grade_level_shipping_doors_width_feet: parseNumber(listing.GradeLevelShippingDoorsWidthFeet),
    grade_level_shipping_doors_width_inches: parseNumber(listing.GradeLevelShippingDoorsWidthInches),
    green_certification_level: listing.GreenCertificationLevel || null,
    green_property_information_statement: parseBoolean(listing.GreenPropertyInformationStatement),
    gross_revenue: parseNumber(listing.GrossRevenue),
    hst_application: Array.isArray(listing.HSTApplication) ? listing.HSTApplication : null,
    handicapped_equipped_yn: parseBoolean(listing.HandicappedEquippedYN),
    heat_source: listing.HeatSource || null,
    heat_type: listing.HeatType || null,
    heating_expenses: parseNumber(listing.HeatingExpenses),
    heating_yn: parseBoolean(listing.HeatingYN),
    holdover_days: parseNumber(listing.HoldoverDays),
    hours_days_of_operation: Array.isArray(listing.HoursDaysOfOperation) ? listing.HoursDaysOfOperation : null,
    hours_days_of_operation_description: listing.HoursDaysOfOperationDescription || null,
    inclusions: listing.Inclusions || null,
    industrial_area: parseNumber(listing.IndustrialArea),
    industrial_area_code: listing.IndustrialAreaCode || null,
    insurance_expense: parseNumber(listing.InsuranceExpense),
    interior_features: Array.isArray(listing.InteriorFeatures) ? listing.InteriorFeatures : null,
    internet_address_display_yn: parseBoolean(listing.InternetAddressDisplayYN),
    internet_entire_listing_display_yn: parseBoolean(listing.InternetEntireListingDisplayYN),
    island_yn: parseBoolean(listing.IslandYN),
    kitchens_above_grade: parseNumber(listing.KitchensAboveGrade),
    kitchens_below_grade: parseNumber(listing.KitchensBelowGrade),
    kitchens_total: parseNumber(listing.KitchensTotal),
    laundry_features: Array.isArray(listing.LaundryFeatures) ? listing.LaundryFeatures : null,
    laundry_level: listing.LaundryLevel || null,
    lease_to_own_equipment: Array.isArray(listing.LeaseToOwnEquipment) ? listing.LeaseToOwnEquipment : null,
    leased_land_fee: parseNumber(listing.LeasedLandFee),
    leased_terms: listing.LeasedTerms || null,
    legal_apartment_number: listing.LegalApartmentNumber || null,
    legal_stories: listing.LegalStories || null,
    link_property: listing.LinkProperty || null,
    link_yn: parseBoolean(listing.LinkYN),
    liquor_license_yn: parseBoolean(listing.LiquorLicenseYN),
    list_aor: listing.ListAOR || null,
    list_agent_aor: listing.ListAgentAOR || null,
    list_agent_direct_phone: listing.ListAgentDirectPhone || null,
    list_agent_full_name: listing.ListAgentFullName || null,
    list_agent_key: listing.ListAgentKey || null,
    list_agent_office_phone: listing.ListAgentOfficePhone || null,
    list_office_aor: listing.ListOfficeAOR || null,
    list_office_key: listing.ListOfficeKey || null,
    list_office_name: listing.ListOfficeName || null,
    list_price: parseNumber(listing.ListPrice),
    list_price_unit: listing.ListPriceUnit || null,
    listing_contract_date: parseDate(listing.ListingContractDate),
    listing_id: listing.ListingId || null,
    listing_key: listing.ListingKey || null,
    living_area_range: listing.LivingAreaRange || null,
    local_improvements: parseBoolean(listing.LocalImprovements),
    local_improvements_comments: listing.LocalImprovementsComments || null,
    locker: listing.Locker || null,
    locker_level: listing.LockerLevel || null,
    locker_number: listing.LockerNumber || null,
    locker_unit: listing.LockerUnit || null,
    lot_depth: parseNumber(listing.LotDepth),
    lot_dimensions_source: listing.LotDimensionsSource || null,
    lot_features: Array.isArray(listing.LotFeatures) ? listing.LotFeatures : null,
    lot_irregularities: listing.LotIrregularities || null,
    lot_shape: listing.LotShape || null,
    lot_size_area: parseNumber(listing.LotSizeArea),
    lot_size_area_units: listing.LotSizeAreaUnits || null,
    lot_size_dimensions: listing.LotSizeDimensions || null,
    lot_size_range_acres: listing.LotSizeRangeAcres || null,
    lot_size_source: listing.LotSizeSource || null,
    lot_size_units: listing.LotSizeUnits || null,
    lot_type: listing.LotType || null,
    lot_width: parseNumber(listing.LotWidth),
    main_level_bathrooms: parseNumber(listing.MainLevelBathrooms),
    main_level_bedrooms: parseNumber(listing.MainLevelBedrooms),
    main_office_key: listing.MainOfficeKey || null,
    maintenance_expense: parseNumber(listing.MaintenanceExpense),
    major_change_timestamp: parseTimestamp(listing.MajorChangeTimestamp),
    maximum_rental_months_term: parseNumber(listing.MaximumRentalMonthsTerm),
    media_change_timestamp: parseTimestamp(listing.MediaChangeTimestamp),
    media_listing_key: listing.MediaListingKey || null,
    minimum_rental_term_months: parseNumber(listing.MinimumRentalTermMonths),
    mls_area_district_old_zone: listing.MLSAreaDistrictOldZone || null,
    mls_area_district_toronto: listing.MLSAreaDistrictToronto || null,
    mls_area_municipality_district: listing.MLSAreaMunicipalityDistrict || null,
    mls_status: listing.MlsStatus || null,
    modification_timestamp: parseTimestamp(listing.ModificationTimestamp),
    net_operating_income: parseNumber(listing.NetOperatingIncome),
    new_construction_yn: parseBoolean(listing.NewConstructionYN),
    number_of_full_time_employees: parseNumber(listing.NumberOfFullTimeEmployees),
    number_of_kitchens: listing.NumberOfKitchens || null,
    number_shares_percent: listing.NumberSharesPercent || null,
    occupant_type: listing.OccupantType || null,
    office_apartment_area: parseNumber(listing.OfficeApartmentArea),
    office_apartment_area_unit: listing.OfficeApartmentAreaUnit || null,
    old_photo_instructions: listing.OldPhotoInstructions || null,
    on_market_date: parseDate(listing.OnMarketDate),
    operating_expense: parseNumber(listing.OperatingExpense),
    original_entry_timestamp: parseTimestamp(listing.OriginalEntryTimestamp),
    original_list_price: parseNumber(listing.OriginalListPrice),
    original_list_price_unit: listing.OriginalListPriceUnit || null,
    originating_system_id: listing.OriginatingSystemID || null,
    originating_system_key: listing.OriginatingSystemKey || null,
    originating_system_name: listing.OriginatingSystemName || null,
    other_expense: parseNumber(listing.OtherExpense),
    other_structures: Array.isArray(listing.OtherStructures) ? listing.OtherStructures : null,
    out_of_area_municipality: listing.OutOfAreaMunicipality || null,
    outside_storage_yn: parseBoolean(listing.OutsideStorageYN),
    ownership_type: listing.OwnershipType || null,
    parcel_number: listing.ParcelNumber || null,
    parcel_number2: listing.ParcelNumber2 || null,
    parcel_of_tied_land: listing.ParcelOfTiedLand || null,
    parking_features: Array.isArray(listing.ParkingFeatures) ? listing.ParkingFeatures : null,
    parking_level_unit1: listing.ParkingLevelUnit1 || null,
    parking_level_unit2: listing.ParkingLevelUnit2 || null,
    parking_monthly_cost: parseNumber(listing.ParkingMonthlyCost),
    parking_spaces: parseNumber(listing.ParkingSpaces),
    parking_spot1: listing.ParkingSpot1 || null,
    parking_spot2: listing.ParkingSpot2 || null,
    parking_total: parseNumber(listing.ParkingTotal),
    parking_type1: listing.ParkingType1 || null,
    parking_type2: listing.ParkingType2 || null,
    payment_frequency: listing.PaymentFrequency || null,
    payment_method: listing.PaymentMethod || null,
    percent_building: listing.PercentBuilding || null,
    percent_list_price: listing.PercentListPrice || null,
    percent_rent: parseNumber(listing.PercentRent),
    permission_to_contact_listing_broker_to_advertise: parseBoolean(listing.PermissionToContactListingBrokerToAdvertise),
    pets_allowed: Array.isArray(listing.PetsAllowed) ? listing.PetsAllowed : null,
    photos_change_timestamp: parseTimestamp(listing.PhotosChangeTimestamp),
    picture_yn: parseBoolean(listing.PictureYN),
    pool_features: Array.isArray(listing.PoolFeatures) ? listing.PoolFeatures : null,
    portion_lease_comments: listing.PortionLeaseComments || null,
    portion_property_lease: Array.isArray(listing.PortionPropertyLease) ? listing.PortionPropertyLease : null,
    possession_date: parseDate(listing.PossessionDate),
    possession_details: listing.PossessionDetails || null,
    possession_type: listing.PossessionType || null,
    postal_code: listing.PostalCode || null,
    previous_list_price: parseNumber(listing.PreviousListPrice),
    price_change_timestamp: parseTimestamp(listing.PriceChangeTimestamp),
    prior_mls_status: listing.PriorMlsStatus || null,
    prior_price_code: listing.PriorPriceCode || null,
    private_entrance_yn: parseBoolean(listing.PrivateEntranceYN),
    private_remarks: listing.PrivateRemarks || null,
    professional_management_expense: parseNumber(listing.ProfessionalManagementExpense),
    property_attached_yn: parseBoolean(listing.PropertyAttachedYN),
    property_features: Array.isArray(listing.PropertyFeatures) ? listing.PropertyFeatures : null,
    property_management_company: listing.PropertyManagementCompany || null,
    property_subtype: listing.PropertySubType || null,
    property_type: listing.PropertyType || null,
    property_use: listing.PropertyUse || null,
    public_remarks: listing.PublicRemarks || null,
    public_remarks_extras: listing.PublicRemarksExtras || null,
    purchase_contract_date: parseDate(listing.PurchaseContractDate),
    rail: listing.Rail || null,
    recreation_room_yn: parseBoolean(listing.RecreationRoomYN),
    references_required_yn: parseBoolean(listing.ReferencesRequiredYN),
    rent_includes: Array.isArray(listing.RentIncludes) ? listing.RentIncludes : null,
    rental_application_yn: parseBoolean(listing.RentalApplicationYN),
    rental_items: listing.RentalItems || null,
    retail_area: parseNumber(listing.RetailArea),
    retail_area_code: listing.RetailAreaCode || null,
    road_access_fee: parseNumber(listing.RoadAccessFee),
    roll_number: listing.RollNumber || null,
    roof: Array.isArray(listing.Roof) ? listing.Roof : null,
    room_height: parseNumber(listing.RoomHeight),
    room_type: Array.isArray(listing.RoomType) ? listing.RoomType : null,
    rooms_above_grade: parseNumber(listing.RoomsAboveGrade),
    rooms_below_grade: parseNumber(listing.RoomsBelowGrade),
    rooms_total: parseNumber(listing.RoomsTotal),
    rural_utilities: Array.isArray(listing.RuralUtilities) ? listing.RuralUtilities : null,
    sales_brochure_url: listing.SalesBrochureUrl || null,
    sauna_yn: parseBoolean(listing.SaunaYN),
    seasonal_dwelling: parseBoolean(listing.SeasonalDwelling),
    seating_capacity: parseNumber(listing.SeatingCapacity),
    security_features: Array.isArray(listing.SecurityFeatures) ? listing.SecurityFeatures : null,
    senior_community_yn: parseBoolean(listing.SeniorCommunityYN),
    sewage: Array.isArray(listing.Sewage) ? listing.Sewage : null,
    sewer: Array.isArray(listing.Sewer) ? listing.Sewer : null,
    sewer_yna: listing.SewerYNA || null,
    shoreline: Array.isArray(listing.Shoreline) ? listing.Shoreline : null,
    shoreline_allowance: listing.ShorelineAllowance || null,
    shoreline_exposure: listing.ShorelineExposure || null,
    showing_appointments: listing.ShowingAppointments || null,
    showing_requirements: Array.isArray(listing.ShowingRequirements) ? listing.ShowingRequirements : null,
    sign_on_property_yn: parseBoolean(listing.SignOnPropertyYN),
    soil_test: listing.SoilTest || null,
    soil_type: Array.isArray(listing.SoilType) ? listing.SoilType : null,
    sold_conditional_entry_timestamp: parseTimestamp(listing.SoldConditionalEntryTimestamp),
    sold_entry_timestamp: parseTimestamp(listing.SoldEntryTimestamp),
    sound_bite_url: listing.SoundBiteUrl || null,
    source_system_id: listing.SourceSystemID || null,
    source_system_name: listing.SourceSystemName || null,
    spa_yn: parseBoolean(listing.SpaYN),
    special_designation: Array.isArray(listing.SpecialDesignation) ? listing.SpecialDesignation : null,
    square_foot_source: listing.SquareFootSource || null,
    squash_racquet: listing.SquashRacquet || null,
    staff_comments: listing.StaffComments || null,
    standard_status: listing.StandardStatus || null,
    state_or_province: listing.StateOrProvince || null,
    statis_cause_internal: listing.StatisCauseInternal || null,
    status_aur: listing.Status_aur || null,
    status_certificate_yn: parseBoolean(listing.StatusCertificateYN),
    street_dir_prefix: listing.StreetDirPrefix || null,
    street_dir_suffix: listing.StreetDirSuffix || null,
    street_name: listing.StreetName || null,
    street_number: listing.StreetNumber || null,
    street_suffix: listing.StreetSuffix || null,
    street_suffix_code: listing.StreetSuffixCode || null,
    structure_type: Array.isArray(listing.StructureType) ? listing.StructureType : null,
    survey_available_yn: parseBoolean(listing.SurveyAvailableYN),
    survey_type: listing.SurveyType || null,
    suspended_date: parseDate(listing.SuspendedDate),
    suspended_entry_timestamp: parseTimestamp(listing.SuspendedEntryTimestamp),
    system_modification_timestamp: parseTimestamp(listing.SystemModificationTimestamp),
    tax_annual_amount: parseNumber(listing.TaxAnnualAmount),
    tax_assessed_value: parseNumber(listing.TaxAssessedValue),
    tax_book_number: listing.TaxBookNumber || null,
    tax_legal_description: listing.TaxLegalDescription || null,
    tax_type: listing.TaxType || null,
    tax_year: parseNumber(listing.TaxYear),
    taxes_expense: parseNumber(listing.TaxesExpense),
    telephone_yna: listing.TelephoneYNA || null,
    terminated_date: parseDate(listing.TerminatedDate),
    terminated_entry_timestamp: parseTimestamp(listing.TerminatedEntryTimestamp),
    timestamp_sql: parseTimestamp(listing.TimestampSQL),
    tmi: listing.TMI || null,
    topography: Array.isArray(listing.Topography) ? listing.Topography : null,
    total_expenses: listing.TotalExpenses || null,
    town: listing.Town || null,
    trailer_parking_spots: parseNumber(listing.TrailerParkingSpots),
    transaction_broker_compensation: listing.TransactionBrokerCompensation || null,
    transaction_type: listing.TransactionType || null,
    truck_level_shipping_doors: parseNumber(listing.TruckLevelShippingDoors),
    truck_level_shipping_doors_height_feet: parseNumber(listing.TruckLevelShippingDoorsHeightFeet),
    truck_level_shipping_doors_height_inches: parseNumber(listing.TruckLevelShippingDoorsHeightInches),
    truck_level_shipping_doors_width_feet: parseNumber(listing.TruckLevelShippingDoorsWidthFeet),
    truck_level_shipping_doors_width_inches: parseNumber(listing.TruckLevelShippingDoorsWidthInches),
    uffi: listing.UFFI || null,
    unavailable_date: parseDate(listing.UnavailableDate),
    under_contract: Array.isArray(listing.UnderContract) ? listing.UnderContract : null,
    unit_number: listing.UnitNumber || null,
    unparsed_address: listing.UnparsedAddress || null,
    utilities: Array.isArray(listing.Utilities) ? listing.Utilities : null,
    vacancy_allowance: parseNumber(listing.VacancyAllowance),
    vendor_property_info_statement: parseBoolean(listing.VendorPropertyInfoStatement),
    view: Array.isArray(listing.View) ? listing.View : null,
    virtual_tour_flag_yn: parseBoolean(listing.VirtualTourFlagYN),
    virtual_tour_url_branded: listing.VirtualTourURLBranded || null,
    virtual_tour_url_branded2: listing.VirtualTourURLBranded2 || null,
    virtual_tour_url_unbranded: listing.VirtualTourURLUnbranded || null,
    virtual_tour_url_unbranded2: listing.VirtualTourURLUnbranded2 || null,
    volts: parseNumber(listing.Volts),
    washrooms_type1: parseNumber(listing.WashroomsType1),
    washrooms_type1_level: listing.WashroomsType1Level || null,
    washrooms_type1_pcs: parseNumber(listing.WashroomsType1Pcs),
    washrooms_type2: parseNumber(listing.WashroomsType2),
    washrooms_type2_level: listing.WashroomsType2Level || null,
    washrooms_type2_pcs: parseNumber(listing.WashroomsType2Pcs),
    washrooms_type3: parseNumber(listing.WashroomsType3),
    washrooms_type3_level: listing.WashroomsType3Level || null,
    washrooms_type3_pcs: parseNumber(listing.WashroomsType3Pcs),
    washrooms_type4: parseNumber(listing.WashroomsType4),
    washrooms_type4_level: listing.WashroomsType4Level || null,
    washrooms_type4_pcs: parseNumber(listing.WashroomsType4Pcs),
    washrooms_type5: parseNumber(listing.WashroomsType5),
    washrooms_type5_level: listing.WashroomsType5Level || null,
    washrooms_type5_pcs: parseNumber(listing.WashroomsType5Pcs),
    water: listing.Water || null,
    water_body_name: listing.WaterBodyName || null,
    water_body_type: listing.WaterBodyType || null,
    water_delivery_feature: Array.isArray(listing.WaterDeliveryFeature) ? listing.WaterDeliveryFeature : null,
    water_expense: parseNumber(listing.WaterExpense),
    water_frontage_ft: listing.WaterFrontageFt || null,
    water_meter_yn: parseBoolean(listing.WaterMeterYN),
    water_source: Array.isArray(listing.WaterSource) ? listing.WaterSource : null,
    water_view: Array.isArray(listing.WaterView) ? listing.WaterView : null,
    water_yna: listing.WaterYNA || null,
    waterfront: Array.isArray(listing.Waterfront) ? listing.Waterfront : null,
    waterfront_accessory: Array.isArray(listing.WaterfrontAccessory) ? listing.WaterfrontAccessory : null,
    waterfront_features: Array.isArray(listing.WaterfrontFeatures) ? listing.WaterfrontFeatures : null,
    waterfront_yn: parseBoolean(listing.WaterfrontYN),
    well_capacity: parseNumber(listing.WellCapacity),
    well_depth: parseNumber(listing.WellDepth),
    winterized: listing.Winterized || null,
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
    year_expenses: parseNumber(listing.YearExpenses),
    zoning: listing.Zoning || null,
    zoning_designation: listing.ZoningDesignation || null,
  };
}

// ============================================
// 2. FILTER MEDIA TO TWO VARIANTS
// ============================================
function filterToTwoVariants(mediaArray: any[]) {
  const grouped = new Map<string, any[]>();
  
  // Group by base image
  mediaArray.forEach(media => {
    const baseId = extractBaseImageId(media.MediaURL || '');
    if (!grouped.has(baseId)) {
      grouped.set(baseId, []);
    }
    grouped.get(baseId)!.push(media);
  });
  
  // Extract only thumbnail and large
  const filtered: any[] = [];
  grouped.forEach((variants) => {
    const thumbnail = variants.find(v => v.ImageSizeDescription === 'Thumbnail');
    const large = variants.find(v => v.ImageSizeDescription === 'Large');
    
    if (thumbnail) filtered.push({...thumbnail, variant_type: 'thumbnail'});
    if (large) filtered.push({...large, variant_type: 'large'});
  });
  
  return filtered;
}

function extractBaseImageId(url: string): string {
  const parts = url.split('/');
  return parts[parts.length - 1] || url;
}

// ============================================
// 3. MAP MEDIA  media (17 FIELDS)
// ============================================
function mapMediaToDatabase(media: any, listingId: string) {
  return {
    listing_id: listingId,
    media_key: media.MediaKey || null,
    media_object_id: media.MediaObjectID || null,
    resource_record_key: media.ResourceRecordKey || null,
    source_system_media_key: media.SourceSystemMediaKey || null,
    media_type: media.MediaType || null,
    media_category: media.MediaCategory || null,
    media_url: media.MediaURL || null,
    media_html: media.MediaHTML || null,
    media_status: media.MediaStatus || null,
    short_description: media.ShortDescription || null,
    long_description: media.LongDescription || null,
    original_media_name: media.OriginalMediaName || null,
    order_number: parseNumber(media.Order),
    preferred_photo_yn: parseBoolean(media.PreferredPhotoYN),
    image_width: parseNumber(media.ImageWidth),
    image_height: parseNumber(media.ImageHeight),
    image_size_description: media.ImageSizeDescription || null,
    image_of: media.ImageOf || null,
    class_name: media.ClassName || null,
    resource_name: media.ResourceName || null,
    permission: Array.isArray(media.Permission) ? media.Permission : null,
    originating_system_id: media.OriginatingSystemID || null,
    originating_system_name: media.OriginatingSystemName || null,
    source_system_id: media.SourceSystemID || null,
    source_system_name: media.SourceSystemName || null,
    media_modification_timestamp: parseTimestamp(media.MediaModificationTimestamp),
    modification_timestamp: parseTimestamp(media.ModificationTimestamp),
    variant_type: media.variant_type || null,
    base_image_id: extractBaseImageId(media.MediaURL || ''),
    created_at: new Date().toISOString()
  };
}

// ============================================
// 4. MAP ROOMS  property_rooms (20 FIELDS)
// ============================================
function mapRoomToDatabase(room: any, listingId: string) {
  return {
    listing_id: listingId,
    listing_key: room.ListingKey || null,
    room_key: room.RoomKey || null,
    room_type: room.RoomType || null,
    room_level: room.RoomLevel || null,
    room_status: room.RoomStatus || null,
    room_dimensions: room.RoomDimensions || null,
    room_length: parseNumber(room.RoomLength),
    room_width: parseNumber(room.RoomWidth),
    room_height: parseNumber(room.RoomHeight),
    room_area: parseNumber(room.RoomArea),
    room_length_width_units: room.RoomLengthWidthUnits || null,
    room_length_width_source: room.RoomLengthWidthSource || null,
    room_area_units: room.RoomAreaUnits || null,
    room_area_source: room.RoomAreaSource || null,
    room_description: room.RoomDescription || null,
    room_features: Array.isArray(room.RoomFeatures) ? room.RoomFeatures : null,
    room_feature1: room.RoomFeature1 || null,
    room_feature2: room.RoomFeature2 || null,
    room_feature3: room.RoomFeature3 || null,
    order_number: parseNumber(room.Order),
    modification_timestamp: parseTimestamp(room.ModificationTimestamp),
    created_at: new Date().toISOString()
  };
}

// ============================================
// 5. MAP OPEN HOUSES  open_houses (8 FIELDS)
// ============================================
function mapOpenHouseToDatabase(openHouse: any, listingId: string) {
  return {
    listing_id: listingId,
    listing_key: openHouse.ListingKey || null,
    open_house_key: openHouse.OpenHouseKey || null,
    open_house_id: openHouse.OpenHouseId || null,
    open_house_date: parseDate(openHouse.OpenHouseDate),
    open_house_start_time: parseTimestamp(openHouse.OpenHouseStartTime),
    open_house_end_time: parseTimestamp(openHouse.OpenHouseEndTime),
    open_house_type: openHouse.OpenHouseType || null,
    open_house_status: openHouse.OpenHouseStatus || null,
    original_entry_timestamp: parseTimestamp(openHouse.OriginalEntryTimestamp),
    modification_timestamp: parseTimestamp(openHouse.ModificationTimestamp),
    created_at: new Date().toISOString()
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseFloat(value.toString());
  return isNaN(parsed) ? null : parsed;
}

function parseBoolean(value: any): boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  return value.toString().toLowerCase() === 'true';
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
