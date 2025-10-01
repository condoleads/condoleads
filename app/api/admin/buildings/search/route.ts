import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { streetNumber, streetName, city, buildingName, fullData } = body;
    
    console.log('Search request received:', { streetNumber, streetName, city, buildingName });
    
    if (!streetNumber || streetNumber.trim() === '') {
      return NextResponse.json(
        { error: 'Street number is required and cannot be empty' },
        { status: 400 }
      );
    }
    
    const baseUrl = process.env.PROPTX_RESO_API_URL;
    const token = process.env.PROPTX_VOW_TOKEN || process.env.PROPTX_BEARER_TOKEN;
    
    if (!baseUrl || !token) {
      return NextResponse.json(
        { error: 'PropTx configuration missing - check environment variables' },
        { status: 500 }
      );
    }
    
    let allListings = [];
    
    // STRATEGY 1: Active listings (keep existing working logic)
    console.log('STRATEGY 1: Active listings (street number based)');
    const activeFilter = `StreetNumber eq '${streetNumber.trim()}'`;
    const activeUrl = `${baseUrl}Property?$filter=${encodeURIComponent(activeFilter)}&$top=5000`;
    
    const activeResponse = await fetch(activeUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (activeResponse.ok) {
      const activeData = await activeResponse.json();
      console.log(`Found ${activeData.value?.length || 0} listings by StreetNumber (includes active)`);
      allListings.push(...(activeData.value || []));
    }
    
    //     // STRATEGY 2+3 COMBINED: Optimized search for completed transactions
    
    console.log('STRATEGY 2+3: Combined search for completed transactions');
    const completedFilter = "(StandardStatus eq 'Closed' or StandardStatus eq 'Sold' or StandardStatus eq 'Leased' or MlsStatus eq 'Sold' or MlsStatus eq 'Sld' or MlsStatus eq 'Leased' or MlsStatus eq 'Lsd')";
    const completedUrl = `${baseUrl}Property?$filter=${encodeURIComponent(completedFilter)}&$top=15000`;
    
    const completedResponse = await fetch(completedUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    if (completedResponse.ok) {
      const completedData = await completedResponse.json();
      console.log(`Found ${completedData.value?.length || 0} completed transactions total`);
      allListings.push(...(completedData.value || []));
    }console.log(`Total raw listings collected: ${allListings.length}`);
    
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
    
    console.log(`Unique listings after deduplication: ${uniqueListings.length}`);
    
    // APPLY SAME 3-WAY FILTERING AS ACTIVE LISTINGS
    let filteredListings = uniqueListings;
    
    // Filter 1: Street Number (exact match)
    console.log(`FILTER 1: Street Number = '${streetNumber.trim()}'`);
    filteredListings = filteredListings.filter(listing => {
      return listing.StreetNumber === streetNumber.trim();
    });
    console.log(`After street number filter: ${filteredListings.length} listings`);
    
    // Filter 2: Street Name (first word match - same as active logic)
    if (streetName && streetName.trim()) {
      const streetFirstWord = streetName.toLowerCase().trim().split(' ')[0];
      console.log(`FILTER 2: Street Name first word = '${streetFirstWord}'`);
      
      filteredListings = filteredListings.filter(listing => {
        const address = (listing.UnparsedAddress || '').toLowerCase();
        const street = (listing.StreetName || '').toLowerCase();
        return address.includes(streetFirstWord) || street.includes(streetFirstWord);
      });
      
      console.log(`After street name filter: ${filteredListings.length} listings`);
    }
    
    // Filter 3: City (first word match - same as active logic)
    if (city && city.trim()) {
      const cityFirstWord = city.toLowerCase().trim().split(' ')[0];
      console.log(`FILTER 3: City first word = '${cityFirstWord}'`);
      
      filteredListings = filteredListings.filter(listing => {
        const address = (listing.UnparsedAddress || '').toLowerCase();
        const listingCity = (listing.City || '').toLowerCase();
        return address.includes(cityFirstWord) || listingCity.includes(cityFirstWord);
      });
      
      console.log(`After city filter: ${filteredListings.length} listings`);
    }
    
    // FILTER 4: EXCLUDE UNWANTED STATUSES
    console.log('FILTER 4: Excluding unwanted statuses (Pending, Cancelled, Withdrawn, Terminated, Suspended, Expired)');
    const excludedStatuses = ['Pending', 'Cancelled', 'Withdrawn', 'Terminated', 'Suspended', 'Expired'];
    const excludedMlsStatuses = ['Cancelled', 'Terminated', 'Expired', 'Withdrawn', 'Susp', 'Pend', 'Leased Conditional', 'Sold Conditional'];
    
    const beforeExclusion = filteredListings.length;
    filteredListings = filteredListings.filter(listing => {
      const status = listing.StandardStatus;
      const mlsStatus = listing.MlsStatus;
      
      // Exclude unwanted standard statuses
      if (excludedStatuses.includes(status)) {
        console.log(`EXCLUDED: ${listing.UnitNumber} - StandardStatus: ${status}`);
        return false;
      }
      
      // Exclude unwanted MLS statuses
      if (excludedMlsStatuses.includes(mlsStatus)) {
        console.log(`EXCLUDED: ${listing.UnitNumber} - MlsStatus: ${mlsStatus}`);
        return false;
      }
      
      return true;
    });
    
    console.log(`After exclusion filter: ${filteredListings.length} listings (removed ${beforeExclusion - filteredListings.length})`);
    
    // ENHANCED DATA COLLECTION - Only if fullData requested
    if (fullData && filteredListings.length > 0) {
      console.log('ENHANCED: Collecting PropertyRooms, Media, and OpenHouses data...');
      
      for (let i = 0; i < filteredListings.length; i++) {
        const listing = filteredListings[i];
        const listingKey = listing.ListingKey;
        
        if (!listingKey) continue;
        
        // Get PropertyRooms data
        try {
          const roomsFilter = `ListingKey eq '${listingKey}'`;
          const roomsUrl = `${baseUrl}PropertyRooms?$filter=${encodeURIComponent(roomsFilter)}&$top=50`;
          
          const roomsResponse = await fetch(roomsUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            }
          });
          
          if (roomsResponse.ok) {
            const roomsData = await roomsResponse.json();
            listing.PropertyRooms = roomsData.value || [];
            if (i < 5) console.log(`Listing ${listingKey}: Found ${listing.PropertyRooms.length} rooms`);
          }
        } catch (roomsError) {
          console.error(`Failed to get rooms for ${listingKey}:`, roomsError);
          listing.PropertyRooms = [];
        }
        
        // Get Media data
        try {
          const mediaFilter = `ResourceRecordKey eq '${listingKey}'`;
          const mediaUrl = `${baseUrl}Media?$filter=${encodeURIComponent(mediaFilter)}&$top=100`;
          
          const mediaResponse = await fetch(mediaUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            }
          });
          
          if (mediaResponse.ok) {
            const mediaData = await mediaResponse.json();
            listing.Media = filterTwoVariants(mediaData.value || []);
            if (i < 5) console.log(`Listing ${listingKey}: Found ${listing.Media.length} media items`);
          }
        } catch (mediaError) {
          console.error(`Failed to get media for ${listingKey}:`, mediaError);
          listing.Media = [];
        }
        
        // Get OpenHouses data
        try {
          const openHouseFilter = `ListingKey eq '${listingKey}'`;
          const openHouseUrl = `${baseUrl}OpenHouse?$filter=${encodeURIComponent(openHouseFilter)}&$top=20`;
          
          const openHouseResponse = await fetch(openHouseUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json'
            }
          });
          
          if (openHouseResponse.ok) {
            const openHouseData = await openHouseResponse.json();
            listing.OpenHouses = openHouseData.value || [];
            if (i < 5 && listing.OpenHouses.length > 0) {
              console.log(`Listing ${listingKey}: Found ${listing.OpenHouses.length} open houses`);
            }
          }
        } catch (openHouseError) {
          console.error(`Failed to get open houses for ${listingKey}:`, openHouseError);
          listing.OpenHouses = [];
        }
      }
    }
    
    // Categorization with 90-day date split
    const { categories, detailedBreakdown } = dateBasedCategorization(filteredListings);
    
    const buildingInfo = {
      buildingName: buildingName || `Building at ${streetNumber} ${streetName || ''}, ${city || ''}`.trim(),
      canonicalAddress: `${streetNumber} ${streetName || ''}, ${city || ''}`.trim(),
      slug: generateSlug(streetNumber, streetName, city, buildingName),
      streetNumber: streetNumber.trim(),
      streetName: streetName?.trim() || '',
      city: city?.trim() || '',
      totalListings: filteredListings.length
    };
    
    return NextResponse.json({
      success: true,
      building: buildingInfo,
      categories: categories,
      detailedBreakdown: detailedBreakdown,
      total: filteredListings.length,
      rawData: filteredListings,  // Always include raw data
      enhancedData: fullData ? filteredListings : null,
      allListings: filteredListings  // Always include all listings
    });
    
  } catch (error: any) {
    console.error('Search error:', error);
    return NextResponse.json(
      { 
        error: 'Search failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}


function filterTwoVariants(allMediaItems) {
  if (!allMediaItems || allMediaItems.length === 0) return [];
  
  console.log(` Filtering ${allMediaItems.length} media items to two variants...`);
  
  // Group by base image using URL pattern
  const imageGroups = new Map();
  
  allMediaItems.forEach(item => {
    // Extract base image ID from PropTx URL
    const baseId = item.MediaURL ? 
      item.MediaURL.split('/').pop()?.split('.')[0] || item.MediaKey :
      item.MediaKey || Math.random().toString();
    
    if (!imageGroups.has(baseId)) {
      imageGroups.set(baseId, []);
    }
    imageGroups.get(baseId).push(item);
  });
  
  const filtered = [];
  let reductionCount = 0;
  
  imageGroups.forEach(variants => {
    const originalCount = variants.length;
    
    // Find thumbnail (240x240)
    const thumbnail = variants.find(v => 
      v.MediaURL?.includes('rs:fit:240:240') || 
      v.ImageSizeDescription === 'Thumbnail'
    );
    
    // Find large (1920x1920) 
    const large = variants.find(v => 
      v.MediaURL?.includes('rs:fit:1920:1920') || 
      v.ImageSizeDescription === 'Large'
    );
    
    if (thumbnail) {
      filtered.push({...thumbnail, variant_type: 'thumbnail'});
    }
    if (large) {
      filtered.push({...large, variant_type: 'large'});
    }
    
    reductionCount += originalCount - (thumbnail ? 1 : 0) - (large ? 1 : 0);
  });
  
  console.log(` Reduced from ${allMediaItems.length} to ${filtered.length} media items (${reductionCount} removed)`);
  return filtered;
}

function dateBasedCategorization(listings: any[]) {
  console.log('=== DATE-BASED CATEGORIZATION (90 DAYS) ===');
  
  const now = new Date();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(now.getDate() - 90);
  
  console.log(`90-day cutoff date: ${ninetyDaysAgo.toISOString().split('T')[0]}`);
  
  const categories = {
    activeForSale: 0,
    activeForLease: 0,
    recentlySold: 0,
    olderSold: 0,
    recentlyLeased: 0,
    olderLeased: 0
  };
  
  const detailedBreakdown = {
    activeForSale: [],
    activeForLease: [],
    recentlySold: [],
    olderSold: [],
    recentlyLeased: [],
    olderLeased: []
  };
  
  listings.forEach((listing) => {
    const status = listing.StandardStatus;
    const transactionType = listing.TransactionType;
    const mlsStatus = listing.MlsStatus;
    const closeDate = listing.CloseDate;
    const unit = listing.UnitNumber || listing.ApartmentNumber || 'N/A';
    const price = listing.ListPrice || listing.ClosePrice || 'N/A';
    
    const listingInfo = {
      unit,
      price,
      closeDate,
      status,
      transactionType,
      mlsStatus,
      mlsNumber: listing.ListingKey || listing.ListingId
    };
    
    // ACTIVE LISTINGS - COMPLETELY UNCHANGED
    if (status === 'Active') {
      if (transactionType === 'For Sale') {
        categories.activeForSale++;
        detailedBreakdown.activeForSale.push(listingInfo);
        return;
      } 
      if (transactionType === 'For Lease') {
        categories.activeForLease++;
        detailedBreakdown.activeForLease.push(listingInfo);
        return;
      }
    }
    
    // COMPLETED TRANSACTIONS - WITH DATE SPLITTING
    const isSold = (
      mlsStatus === 'Sold' || mlsStatus === 'Sld' ||
      status === 'Sold' || status === 'Sld'
    );
    
    const isLeased = (
      mlsStatus === 'Leased' || mlsStatus === 'Lsd' ||
      status === 'Leased' || status === 'Lsd'
    );
    
    if (isSold || isLeased) {
      // Check if recent (within 90 days) based on CloseDate
      const isRecent = closeDate && new Date(closeDate) >= ninetyDaysAgo;
      
      if (isSold) {
        if (isRecent) {
          categories.recentlySold++;
          detailedBreakdown.recentlySold.push(listingInfo);
          console.log(`RECENTLY SOLD: Unit ${unit} - ${closeDate}`);
        } else {
          categories.olderSold++;
          detailedBreakdown.olderSold.push(listingInfo);
          console.log(`OLDER SOLD: Unit ${unit} - ${closeDate || 'no date'}`);
        }
      } else if (isLeased) {
        if (isRecent) {
          categories.recentlyLeased++;
          detailedBreakdown.recentlyLeased.push(listingInfo);
          console.log(`RECENTLY LEASED: Unit ${unit} - ${closeDate}`);
        } else {
          categories.olderLeased++;
          detailedBreakdown.olderLeased.push(listingInfo);
          console.log(`OLDER LEASED: Unit ${unit} - ${closeDate || 'no date'}`);
        }
      }
    }
  });
  
  console.log(`RESULTS: ${categories.activeForSale} for sale, ${categories.activeForLease} for lease`);
  console.log(`         ${categories.recentlySold} recently sold, ${categories.olderSold} older sold`);
  console.log(`         ${categories.recentlyLeased} recently leased, ${categories.olderLeased} older leased`);
  
  return { categories, detailedBreakdown };
}


// Complete DLA field list matching your 470+ field schema
function getDLAFields() {
  return [
    // Core Identifiers
    'ListingKey', 'ListingId', 'OriginatingSystemID', 'OriginatingSystemKey', 'OriginatingSystemName',
    
    // Address Components  
    'StreetNumber', 'StreetName', 'StreetSuffix', 'StreetDirPrefix', 'StreetDirSuffix', 'City', 'UnparsedAddress',
    'UnitNumber', 'ApartmentNumber', 'LegalApartmentNumber', 'LegalStories',
    
    // Property Type
    'PropertyType', 'PropertySubType', 'PropertyUse', 'BoardPropertyType', 'TransactionType',
    
    // Pricing
    'ListPrice', 'ListPriceUnit', 'OriginalListPrice', 'PreviousListPrice', 'ClosePrice', 'PercentListPrice',
    
    // Status Fields
    'StandardStatus', 'MlsStatus', 'PriorMlsStatus', 'ContractStatus', 'StatusAUR', 'StatisCauseInternal',
    
    // Dates
    'ListingContractDate', 'OriginalEntryTimestamp', 'OnMarketDate', 'CloseDate', 'PurchaseContractDate',
    'PossessionDate', 'ExpirationDate', 'ConditionalExpiryDate', 'UnavailableDate', 'SuspendedDate', 'TerminatedDate',
    
    // All Timestamps (20+ fields)
    'ModificationTimestamp', 'MajorChangeTimestamp', 'PriceChangeTimestamp', 'PhotosChangeTimestamp',
    'MediaChangeTimestamp', 'StatusChangeTimestamp', 'AddChangeTimestamp', 'BackOnMarketEntryTimestamp',
    'SoldEntryTimestamp', 'SoldConditionalEntryTimestamp', 'LeasedEntryTimestamp', 'LeasedConditionalEntryTimestamp',
    'DealFellThroughEntryTimestamp', 'ExtensionEntryTimestamp', 'SuspendedEntryTimestamp', 'TerminatedEntryTimestamp',
    'ImportTimestamp', 'SystemModificationTimestamp', 'TimestampSQL',
    
    // Room Counts (15+ fields)
    'BedroomsTotal', 'BedroomsAboveGrade', 'BedroomsBelowGrade', 'BathroomsTotalInteger',
    'MainLevelBedrooms', 'MainLevelBathrooms', 'KitchensTotal', 'KitchensAboveGrade', 'KitchensBelowGrade',
    'RoomsTotal', 'RoomsAboveGrade', 'RoomsBelowGrade', 'DenFamilyroomYN', 'RecreationRoomYN',
    
    // Size & Measurements
    'BuildingAreaTotal', 'BuildingAreaUnits', 'LivingAreaRange', 'SquareFootSource',
    
    // Lot Details (15+ fields)
    'LotSizeArea', 'LotSizeAreaUnits', 'LotSizeDimensions', 'LotSizeUnits', 'LotSizeRangeAcres', 'LotSizeSource',
    'LotWidth', 'LotDepth', 'FrontageLength', 'LotShape', 'LotType', 'LotFeatures', 'LotIrregularities', 'LotDimensionsSource',
    
    // Fees & Taxes (20+ fields)
    'AssociationFee', 'AssociationFeeFrequency', 'AssociationFeeIncludes', 'AdditionalMonthlyFee', 'AdditionalMonthlyFeeFrequency',
    'CommercialCondoFee', 'CommercialCondoFeeFrequency', 'TaxAnnualAmount', 'TaxYear', 'TaxAssessedValue', 'AssessmentYear',
    'TaxType', 'TaxLegalDescription', 'TaxBookNumber', 'HSTApplication',
    
    // Parking (15+ fields)
    'ParkingTotal', 'ParkingSpaces', 'CoveredSpaces', 'CarportSpaces', 'GarageParkingSpaces',
    'ParkingType1', 'ParkingType2', 'ParkingSpot1', 'ParkingSpot2', 'ParkingLevelUnit1', 'ParkingLevelUnit2',
    'ParkingMonthlyCost', 'ParkingFeatures', 'AttachedGarageYN', 'GarageYN', 'GarageType', 'TrailerParkingSpots',
    
    // Storage
    'Locker', 'LockerNumber', 'LockerLevel', 'LockerUnit', 'OutsideStorageYN',
    
    // Unit Features (20+ fields)
    'BalconyType', 'Exposure', 'DirectionFaces', 'View', 'WaterView', 'EnsuiteLaundryYN', 'LaundryFeatures', 'LaundryLevel',
    'CentralVacuumYN', 'PrivateEntranceYN', 'HandicappedEquippedYN', 'AccessibilityFeatures',
    
    // Heating & Cooling
    'HeatType', 'HeatSource', 'HeatingYN', 'HeatingExpenses', 'Cooling', 'CoolingYN',
    
    // Utilities (15+ fields)
    'ElectricYNA', 'ElectricExpense', 'ElectricOnPropertyYN', 'GasYNA', 'WaterYNA', 'WaterExpense', 'WaterMeterYN',
    'CableYNA', 'TelephoneYNA', 'SewerYNA', 'Utilities',
    
    // Rental Specific (20+ fields)
    'Furnished', 'LeaseAmount', 'LeaseTerm', 'MinimumRentalTermMonths', 'MaximumRentalMonthsTerm',
    'RentIncludes', 'RentalApplicationYN', 'ReferencesRequiredYN', 'CreditCheckYN', 'EmploymentLetterYN',
    'DepositRequired', 'PetsAllowed', 'LeaseAgreementYN', 'LeasedTerms', 'LeaseToOwnEquipment',
    'LeasedLandFee', 'BuyOptionYN',
    
    // Descriptions
    'PublicRemarks', 'PublicRemarksExtras', 'PrivateRemarks', 'Inclusions', 'Exclusions', 'ChattelsYN', 'RentalItems',
    
    // Possession & Conditions
    'PossessionType', 'PossessionDetails', 'ConditionOfSale', 'EscapeClauseYN', 'EscapeClauseHours',
    'AssignmentYN', 'VendorPropertyInfoStatement', 'StatusCertificateYN',
    
    // Showing
    'ShowingRequirements', 'ShowingAppointments', 'SignOnPropertyYN', 'AccessToProperty',
    'ContactAfterExpiryYN', 'PermissionToContactListingBrokerToAdvertise',
    
    // Location
    'Directions', 'CrossStreet', 'CityRegion', 'CountyOrParish', 'OutOfAreaMunicipality', 'StateOrProvince',
    'Country', 'PostalCode', 'MapPage', 'MapColumn', 'MapRow',
    
    // Building Info
    'BuildingName', 'BusinessName', 'AssociationName', 'AssociationYN', 'AssociationAmenities',
    'CondoCorpNumber', 'PropertyManagementCompany',
    
    // Construction (15+ fields)
    'NewConstructionYN', 'ApproximateAge', 'ConstructionMaterials', 'ArchitecturalStyle', 'StructureType',
    'FoundationDetails', 'Roof', 'ExteriorFeatures',
    
    // Interior Features
    'InteriorFeatures', 'FireplaceYN', 'FireplacesTotal', 'FireplaceFeatures', 'Basement', 'BasementYN', 'UFFI',
    
    // Special Features (20+ fields)
    'PoolFeatures', 'SpaYN', 'SaunaYN', 'WaterfrontYN', 'Waterfront', 'WaterfrontFeatures',
    'WaterBodyName', 'WaterBodyType', 'WaterFrontageFt', 'IslandYN', 'Shoreline',
    
    // Commercial/Business (10+ fields)
    'BusinessType', 'FranchiseYN', 'FreestandingYN', 'LiquorLicenseYN', 'SeatingCapacity',
    'NumberOfFullTimeEmployees', 'HoursDaysOfOperation', 'HoursDaysOfOperationDescription',
    
    // Industrial (25+ fields)
    'IndustrialArea', 'IndustrialAreaCode', 'OfficeApartmentArea', 'OfficeApartmentAreaUnit',
    'RetailArea', 'RetailAreaCode', 'PercentBuilding', 'ClearHeightFeet', 'ClearHeightInches',
    'BaySizeLengthFeet', 'BaySizeLengthInches', 'BaySizeWidthFeet', 'BaySizeWidthInches',
    'CraneYN', 'Rail', 'DockingType',
    
    // Shipping Doors (20+ fields)
    'DoubleManShippingDoors', 'DoubleManShippingDoorsHeightFeet', 'DoubleManShippingDoorsHeightInches',
    'DoubleManShippingDoorsWidthFeet', 'DoubleManShippingDoorsWidthInches',
    'DriveInLevelShippingDoors', 'DriveInLevelShippingDoorsHeightFeet', 'DriveInLevelShippingDoorsHeightInches',
    'DriveInLevelShippingDoorsWidthFeet', 'DriveInLevelShippingDoorsWidthInches',
    'GradeLevelShippingDoors', 'GradeLevelShippingDoorsHeightFeet', 'GradeLevelShippingDoorsHeightInches',
    'GradeLevelShippingDoorsWidthFeet', 'GradeLevelShippingDoorsWidthInches',
    'TruckLevelShippingDoors', 'TruckLevelShippingDoorsHeightFeet', 'TruckLevelShippingDoorsHeightInches',
    'TruckLevelShippingDoorsWidthFeet', 'TruckLevelShippingDoorsWidthInches',
    
    // Electrical
    'Amps', 'Volts',
    
    // Financial (20+ fields)
    'GrossRevenue', 'NetOperatingIncome', 'OperatingExpense', 'TotalExpenses', 'Expenses',
    'YearExpenses', 'InsuranceExpense', 'MaintenanceExpense', 'ProfessionalManagementExpense',
    'OtherExpense', 'TaxesExpense', 'VacancyAllowance', 'FinancialStatementAvailableYN',
    'EstimatedInventoryValueAtCost', 'PercentRent', 'CommonAreaUpcharge',
    
    // Land/Rural (15+ fields)
    'FarmType', 'FarmFeatures', 'SoilType', 'SoilTest', 'Topography', 'Vegetation',
    'RuralUtilities', 'WaterSource', 'WaterDeliveryFeature', 'WellDepth', 'WellCapacity', 'Sewage', 'Sewer',
    
    // Environmental
    'EnergyCertificate', 'GreenCertificationLevel', 'GreenPropertyInformationStatement', 'AlternativePower',
    
    // Legal (15+ fields)
    'ParcelNumber', 'ParcelNumber2', 'RollNumber', 'Zoning', 'ZoningDesignation',
    'SurveyAvailableYN', 'SurveyType', 'EasementsRestrictions', 'Disclosures',
    'LocalImprovements', 'LocalImprovementsComments', 'DevelopmentChargesPaid',
    'ParcelOfTiedLand', 'RoadAccessFee',
    
    // Brokerage Info (25+ fields)
    'ListOfficeKey', 'ListOfficeName', 'ListAgentKey', 'ListAgentFullName', 'ListAgentDirectPhone',
    'ListAgentOfficePhone', 'ListAOR', 'ListAgentAOR', 'ListOfficeAOR',
    'CoListOfficeKey', 'CoListOfficeName', 'CoListAgentKey', 'CoListAgentFullName', 'CoListAgentAOR', 'CoListOfficePhone',
    'CoListOfficeKey3', 'CoListOfficeName3', 'CoListAgent3FullName', 'CoListAgent3Key',
    'CoListOfficeKey4', 'CoListOfficeName4', 'CoListAgent4FullName', 'CoListAgent4Key',
    'BuyerOfficeName', 'CoBuyerOfficeName', 'CoBuyerOfficeName3', 'CoBuyerOfficeName4',
    'BrokerFaxNumber', 'TransactionBrokerCompensation',
    
    // Media References
    'VirtualTourURLUnbranded', 'VirtualTourURLUnbranded2', 'VirtualTourURLBranded', 'VirtualTourURLBranded2',
    'VirtualTourFlagYN', 'SalesBrochureURL', 'SoundBiteURL', 'AdditionalPicturesURL', 'AlternateFeatureSheet',
    
    // Internet Distribution
    'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN', 'DDFYN', 'PictureYN',
    
    // Special Fields
    'FractionalOwnershipYN', 'SeasonalDwelling', 'SeniorCommunityYN', 'PropertyAttachedYN',
    'UnderContract', 'SpecialDesignation', 'CommunityFeatures', 'PropertyFeatures',
    'OtherStructures', 'HoldoverDays', 'OccupantType', 'OwnershipType',
    
    // Linking
    'LinkYN', 'LinkProperty',
    
    // Year-based Lease Pricing
    'Year1LeasePrice', 'Year1LeasePriceHold', 'Year2LeasePrice', 'Year2LeasePriceHold',
    'Year3LeasePrice', 'Year3LeasePriceHold', 'Year4LeasePrice', 'Year4LeasePriceHold',
    'Year5LeasePrice', 'Year5LeasePriceHold',
    
    // Room Types
    'RoomType',
    
    // VOW-Specific Fields
    'CloseDateHold', 'ClosePriceHold', 'DiscloseAfterClosingDate', 'DoNotDiscloseUntilClosingYN',
    'MortgageComment', 'SoldArea', 'SoldAreaCode', 'SoldAreaUnits', 'DaysOnMarket'
  ].join(',');
}

function generateSlug(streetNumber: string, streetName?: string, city?: string, buildingName?: string) {
  const parts = [];
  if (buildingName?.trim()) parts.push(buildingName.toLowerCase());
  if (streetNumber?.trim()) parts.push(streetNumber);
  if (streetName?.trim()) parts.push(streetName.toLowerCase());
  if (city?.trim()) parts.push(city.toLowerCase());
  
  return parts
    .join('-')
    .replace(/[^a-z0-9\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

















