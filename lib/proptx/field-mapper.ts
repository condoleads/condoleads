export class FieldMapper {
  mapPropTxToDatabase(proptxListing: any, buildingId: string): any {
    return {
      // Building relationship
      building_id: buildingId,
      
      // ===== IDENTIFIERS =====
      listing_key: proptxListing.ListingKey,
      listing_id: proptxListing.ListingId || proptxListing.ListingKey,
      originating_system_id: proptxListing.OriginatingSystemID,
      originating_system_key: proptxListing.OriginatingSystemKey,
      originating_system_name: proptxListing.OriginatingSystemName,
      
      // ===== ADDRESS =====
      street_number: proptxListing.StreetNumber,
      street_name: proptxListing.StreetName,
      street_suffix: proptxListing.StreetSuffix,
      street_dir_prefix: proptxListing.StreetDirPrefix,
      street_dir_suffix: proptxListing.StreetDirSuffix,
      city: proptxListing.City,
      unparsed_address: proptxListing.UnparsedAddress,
      
      // ===== UNIT INFO =====
      unit_number: proptxListing.UnitNumber,
      apartment_number: proptxListing.ApartmentNumber,
      legal_apartment_number: proptxListing.LegalApartmentNumber,
      legal_stories: proptxListing.LegalStories,
      
      // ===== PROPERTY TYPE =====
      property_type: proptxListing.PropertyType,
      property_subtype: proptxListing.PropertySubType,
      property_use: proptxListing.PropertyUse,
      board_property_type: proptxListing.BoardPropertyType,
      transaction_type: proptxListing.TransactionType,
      
      // ===== PRICING =====
      list_price: this.parseInteger(proptxListing.ListPrice),
      list_price_unit: proptxListing.ListPriceUnit,
      original_list_price: this.parseInteger(proptxListing.OriginalListPrice),
      previous_list_price: this.parseInteger(proptxListing.PreviousListPrice),
      close_price: this.parseInteger(proptxListing.ClosePrice),
      percent_list_price: proptxListing.PercentListPrice,
      
      // ===== STATUS FIELDS =====
      standard_status: proptxListing.StandardStatus,
      mls_status: proptxListing.MlsStatus,
      prior_mls_status: proptxListing.PriorMlsStatus,
      contract_status: proptxListing.ContractStatus,
      status_aur: proptxListing.StatusAur,
      statis_cause_internal: proptxListing.StatisCauseInternal,
      
      // ===== DATES =====
      listing_contract_date: this.parseDate(proptxListing.ListingContractDate),
      original_entry_timestamp: this.parseTimestamp(proptxListing.OriginalEntryTimestamp),
      on_market_date: this.parseDate(proptxListing.OnMarketDate),
      close_date: this.parseDate(proptxListing.CloseDate),
      purchase_contract_date: this.parseDate(proptxListing.PurchaseContractDate),
      possession_date: this.parseDate(proptxListing.PossessionDate),
      expiration_date: this.parseDate(proptxListing.ExpirationDate),
      conditional_expiry_date: this.parseDate(proptxListing.ConditionalExpiryDate),
      unavailable_date: this.parseDate(proptxListing.UnavailableDate),
      suspended_date: this.parseDate(proptxListing.SuspendedDate),
      terminated_date: this.parseDate(proptxListing.TerminatedDate),
      
      // ===== TIMESTAMPS =====
      modification_timestamp: this.parseTimestamp(proptxListing.ModificationTimestamp),
      major_change_timestamp: this.parseTimestamp(proptxListing.MajorChangeTimestamp),
      price_change_timestamp: this.parseTimestamp(proptxListing.PriceChangeTimestamp),
      photos_change_timestamp: this.parseTimestamp(proptxListing.PhotosChangeTimestamp),
      media_change_timestamp: this.parseTimestamp(proptxListing.MediaChangeTimestamp),
      status_change_timestamp: this.parseTimestamp(proptxListing.StatusChangeTimestamp),
      
      // ===== ROOM COUNTS =====
      bedrooms_total: this.parseInteger(proptxListing.BedroomsTotal),
      bedrooms_above_grade: this.parseInteger(proptxListing.BedroomsAboveGrade),
      bedrooms_below_grade: this.parseInteger(proptxListing.BedroomsBelowGrade),
      bathrooms_total_integer: this.parseInteger(proptxListing.BathroomsTotalInteger),
      main_level_bedrooms: this.parseInteger(proptxListing.MainLevelBedrooms),
      main_level_bathrooms: this.parseInteger(proptxListing.MainLevelBathrooms),
      kitchens_total: this.parseInteger(proptxListing.KitchensTotal),
      kitchens_above_grade: this.parseInteger(proptxListing.KitchensAboveGrade),
      kitchens_below_grade: this.parseInteger(proptxListing.KitchensBelowGrade),
      rooms_total: this.parseInteger(proptxListing.RoomsTotal),
      rooms_above_grade: this.parseInteger(proptxListing.RoomsAboveGrade),
      rooms_below_grade: this.parseInteger(proptxListing.RoomsBelowGrade),
      den_familyroom_yn: this.parseBoolean(proptxListing.DenFamilyroomYN),
      recreation_room_yn: this.parseBoolean(proptxListing.RecreationRoomYN),
      
      // ===== SIZE & MEASUREMENTS =====
      building_area_total: this.parseInteger(proptxListing.BuildingAreaTotal),
      building_area_units: proptxListing.BuildingAreaUnits,
      living_area_range: proptxListing.LivingAreaRange,
      square_foot_source: proptxListing.SquareFootSource,
      
      // ===== FEES & TAXES =====
      association_fee: this.parseDecimal(proptxListing.AssociationFee),
      association_fee_frequency: proptxListing.AssociationFeeFrequency,
      association_fee_includes: this.parseJsonArray(proptxListing.AssociationFeeIncludes),
      additional_monthly_fee: this.parseDecimal(proptxListing.AdditionalMonthlyFee),
      commercial_condo_fee: this.parseDecimal(proptxListing.CommercialCondoFee),
      tax_annual_amount: this.parseDecimal(proptxListing.TaxAnnualAmount),
      tax_year: this.parseInteger(proptxListing.TaxYear),
      tax_assessed_value: this.parseInteger(proptxListing.TaxAssessedValue),
      assessment_year: this.parseInteger(proptxListing.AssessmentYear),
      tax_type: proptxListing.TaxType,
      tax_legal_description: proptxListing.TaxLegalDescription,
      hst_application: this.parseJsonArray(proptxListing.HSTApplication),
      
      // ===== PARKING =====
      parking_total: this.parseInteger(proptxListing.ParkingTotal),
      parking_spaces: this.parseInteger(proptxListing.ParkingSpaces),
      covered_spaces: this.parseInteger(proptxListing.CoveredSpaces),
      garage_parking_spaces: proptxListing.GarageParkingSpaces,
      parking_type1: proptxListing.ParkingType1,
      parking_type2: proptxListing.ParkingType2,
      parking_spot1: proptxListing.ParkingSpot1,
      parking_spot2: proptxListing.ParkingSpot2,
      parking_level_unit1: proptxListing.ParkingLevelUnit1,
      parking_level_unit2: proptxListing.ParkingLevelUnit2,
      parking_monthly_cost: this.parseDecimal(proptxListing.ParkingMonthlyCost),
      
      // ===== STORAGE =====
      locker: proptxListing.Locker,
      locker_number: proptxListing.LockerNumber,
      locker_level: proptxListing.LockerLevel,
      locker_unit: proptxListing.LockerUnit,
      
      // ===== UNIT FEATURES =====
      balcony_type: proptxListing.BalconyType,
      exposure: proptxListing.Exposure,
      direction_faces: proptxListing.DirectionFaces,
      view: this.parseJsonArray(proptxListing.View),
      water_view: this.parseJsonArray(proptxListing.WaterView),
      ensuite_laundry_yn: this.parseBoolean(proptxListing.EnsuiteLaundryYN),
      central_vacuum_yn: this.parseBoolean(proptxListing.CentralVacuumYN),
      private_entrance_yn: this.parseBoolean(proptxListing.PrivateEntranceYN),
      
      // ===== HEATING & COOLING =====
      heat_type: proptxListing.HeatType,
      heat_source: proptxListing.HeatSource,
      heating_yn: this.parseBoolean(proptxListing.HeatingYN),
      heating_expenses: this.parseDecimal(proptxListing.HeatingExpenses),
      cooling: proptxListing.Cooling,
      cooling_yn: this.parseBoolean(proptxListing.CoolingYN),
      
      // ===== UTILITIES =====
      electric_yna: proptxListing.ElectricYNA,
      electric_expense: this.parseDecimal(proptxListing.ElectricExpense),
      gas_yna: proptxListing.GasYNA,
      water_yna: proptxListing.WaterYNA,
      water_expense: this.parseDecimal(proptxListing.WaterExpense),
      cable_yna: proptxListing.CableYNA,
      telephone_yna: proptxListing.TelephoneYNA,
      sewer_yna: proptxListing.SewerYNA,
      
      // ===== RENTAL SPECIFIC =====
      furnished: proptxListing.Furnished,
      lease_amount: this.parseDecimal(proptxListing.LeaseAmount),
      lease_term: proptxListing.LeaseTerm,
      minimum_rental_term_months: this.parseInteger(proptxListing.MinimumRentalTermMonths),
      rent_includes: this.parseJsonArray(proptxListing.RentIncludes),
      rental_application_yn: this.parseBoolean(proptxListing.RentalApplicationYN),
      references_required_yn: this.parseBoolean(proptxListing.ReferencesRequiredYN),
      credit_check_yn: this.parseBoolean(proptxListing.CreditCheckYN),
      employment_letter_yn: this.parseBoolean(proptxListing.EmploymentLetterYN),
      deposit_required: this.parseBoolean(proptxListing.DepositRequired),
      pets_allowed: this.parseJsonArray(proptxListing.PetsAllowed),
      
      // ===== DESCRIPTIONS =====
      public_remarks: proptxListing.PublicRemarks,
      public_remarks_extras: proptxListing.PublicRemarksExtras,
      private_remarks: proptxListing.PrivateRemarks,
      inclusions: proptxListing.Inclusions,
      exclusions: proptxListing.Exclusions,
      
      // ===== POSSESSION & CONDITIONS =====
      possession_type: proptxListing.PossessionType,
      possession_details: proptxListing.PossessionDetails,
      condition_of_sale: proptxListing.ConditionOfSale,
      escape_clause_yn: this.parseBoolean(proptxListing.EscapeClauseYN),
      assignment_yn: this.parseBoolean(proptxListing.AssignmentYN),
      status_certificate_yn: this.parseBoolean(proptxListing.StatusCertificateYN),
      
      // ===== SHOWING =====
      showing_requirements: this.parseJsonArray(proptxListing.ShowingRequirements),
      showing_appointments: proptxListing.ShowingAppointments,
      sign_on_property_yn: this.parseBoolean(proptxListing.SignOnPropertyYN),
      
      // ===== LOCATION =====
      directions: proptxListing.Directions,
      cross_street: proptxListing.CrossStreet,
      city_region: proptxListing.CityRegion,
      state_or_province: proptxListing.StateOrProvince,
      country: proptxListing.Country,
      postal_code: proptxListing.PostalCode,
      
      // ===== BUILDING INFO =====
      building_name: proptxListing.BuildingName,
      association_name: proptxListing.AssociationName,
      association_amenities: this.parseJsonArray(proptxListing.AssociationAmenities),
      condo_corp_number: proptxListing.CondoCorpNumber,
      property_management_company: proptxListing.PropertyManagementCompany,
      
      // ===== BROKERAGE INFO =====
      list_office_name: proptxListing.ListOfficeName,
      list_agent_full_name: proptxListing.ListAgentFullName,
      list_agent_direct_phone: proptxListing.ListAgentDirectPhone,
      
      // ===== MEDIA REFERENCES =====
      virtual_tour_url_unbranded: proptxListing.VirtualTourURLUnbranded,
      virtual_tour_url_branded: proptxListing.VirtualTourURLBranded,
      
      // ===== ACCESS CONTROL =====
      available_in_idx: this.shouldIncludeInIDX(proptxListing),
      available_in_vow: this.shouldIncludeInVOW(proptxListing),
      available_in_dla: true, // All DLA data available internally
      
      // ===== SYSTEM =====
      sync_source: 'dla'
    };
  }
  
  // ===== HELPER METHODS =====
  
  private parseInteger(value: any): number | null {
    if (!value) return null;
    const parsed = parseInt(String(value));
    return isNaN(parsed) ? null : parsed;
  }
  
  private parseDecimal(value: any): number | null {
    if (!value) return null;
    const parsed = parseFloat(String(value));
    return isNaN(parsed) ? null : parsed;
  }
  
  private parseBoolean(value: any): boolean | null {
    if (value === null || value === undefined) return null;
    const str = String(value).toLowerCase();
    if (str === 'true' || str === 'yes' || str === '1') return true;
    if (str === 'false' || str === 'no' || str === '0') return false;
    return null;
  }
  
  private parseDate(value: any): string | null {
    if (!value) return null;
    try {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }
  
  private parseTimestamp(value: any): string | null {
    if (!value) return null;
    try {
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date.toISOString();
    } catch {
      return null;
    }
  }
  
  private parseJsonArray(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
    return [value];
  }
  
  private shouldIncludeInIDX(listing: any): boolean {
    // IDX rules: Active listings only, basic info
    return listing.StandardStatus === 'Active';
  }
  
  private shouldIncludeInVOW(listing: any): boolean {
    // VOW rules: More data available to registered users
    return true; // Most listings available in VOW
  }
}
