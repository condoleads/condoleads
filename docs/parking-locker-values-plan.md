# CondoLeads Parking & Locker Value System

## Overview
Auto-calculate parking and locker values at Area, Municipality, Community, and Building levels for use in:
- Estimator adjustments
- Building landing pages
- Listing detail pages
- Admin settings (self-populated defaults)

## Trigger: Manual (Admin runs when needed)

---

## PHASE 1: Monthly Parking Cost (Lease)  COMPLETED

### Criteria
- PropertyType: `Residential Condo & Other`
- TransactionType: `For Lease` OR StandardStatus: `Leased`
- Field: `ParkingMonthlyCost`
- Filters:
  - Toronto: No limit
  - Outside Toronto: Max $250
  - Minimum 10 records per group to calculate average

### Working Script
```powershell
$found = @()
$skip = 0

while ($skip -lt 50000) {
    $url = "https://query.ampre.ca/odata/Property?`$filter=PropertyType eq 'Residential Condo %26 Other' and (TransactionType eq 'For Lease' or StandardStatus eq 'Leased')&`$select=StreetNumber,StreetName,UnitNumber,CountyOrParish,City,CityRegion,ParkingMonthlyCost&`$top=500&`$skip=$skip"
    
    $r = Invoke-RestMethod -Uri $url -Headers @{Authorization = "Bearer $token"} -Method Get
    
    if ($r.value.Count -eq 0) { break }
    
    $withParking = $r.value | Where-Object { 
        $_.ParkingMonthlyCost -gt 0 -and (
            ($_.CountyOrParish -eq 'Toronto') -or
            ($_.CountyOrParish -ne 'Toronto' -and $_.ParkingMonthlyCost -le 250)
        )
    }
    $found += $withParking
    
    Write-Host "Skip=$skip | Batch=$($r.value.Count) | Found=$($withParking.Count) | Total=$($found.Count)"
    
    $skip += 500
}

# Average by Area (min 10 records)
$found | Group-Object CountyOrParish | Where-Object { $_.Count -ge 10 } | ForEach-Object {
    $avg = ($_.Group | Measure-Object ParkingMonthlyCost -Average).Average
    Write-Host "$($_.Name): `$$([math]::Round($avg,2)) ($($_.Count) records)"
}

# Average by Municipality (min 10 records)
$found | Group-Object City | Where-Object { $_.Count -ge 10 } | Sort-Object Name | ForEach-Object {
    $avg = ($_.Group | Measure-Object ParkingMonthlyCost -Average).Average
    Write-Host "$($_.Name): `$$([math]::Round($avg,2)) ($($_.Count) records)"
}

# Average by Community (min 10 records)
$found | Group-Object CityRegion | Where-Object { $_.Count -ge 10 } | Sort-Object Name | ForEach-Object {
    $avg = ($_.Group | Measure-Object ParkingMonthlyCost -Average).Average
    Write-Host "$($_.Name): `$$([math]::Round($avg,2)) ($($_.Count) records)"
}
```

### Sample Results (Toronto C01)
| Address | ParkingMonthlyCost |
|---------|-------------------|
| 50 Portland #427 | $170/mo |
| 925 Bay #807 | $175/mo |
| 666 Spadina #2101 | $225/mo |
| 20 Joe Shuster #911 | $125/mo |

---

## PHASE 2: Monthly Locker Cost (Lease) - NEXT

### Criteria
- PropertyType: `Residential Condo & Other`
- TransactionType: `For Lease` OR StandardStatus: `Leased`
- Field: TBD (need to discover)
- Same geographic grouping as Phase 1

### Status:  Pending - Need to find field

---

## PHASE 3: Parking Price (Sale)

### Criteria
- PropertyType: `Residential Condo & Other`
- TransactionType: `For Sale` OR StandardStatus: `Sold`
- Field: TBD
- Different logic - ONE-TIME purchase price ($30,000 - $100,000+)

### Status:  Pending

---

## PHASE 4: Locker Price (Sale)

### Criteria
- PropertyType: `Residential Condo & Other`
- TransactionType: `For Sale` OR StandardStatus: `Sold`
- Field: TBD
- ONE-TIME purchase price ($5,000 - $15,000)

### Status:  Pending

---

## PHASE 5: Database Storage

### Table: `market_adjustments`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| level | VARCHAR | 'area', 'municipality', 'community', 'building' |
| level_id | UUID | FK to respective table |
| level_name | VARCHAR | Display name |
| parking_monthly_avg | DECIMAL | Lease parking $/mo |
| parking_monthly_count | INTEGER | Records used |
| locker_monthly_avg | DECIMAL | Lease locker $/mo |
| locker_monthly_count | INTEGER | Records used |
| parking_price_avg | DECIMAL | Sale parking $ |
| parking_price_count | INTEGER | Records used |
| locker_price_avg | DECIMAL | Sale locker $ |
| locker_price_count | INTEGER | Records used |
| last_calculated_at | TIMESTAMPTZ | When calculated |

### Status:  Pending

---

## PHASE 6: Admin UI

### Location: `/admin/market-values`

### Features
- View auto-calculated values by level
- Override capability
- "Recalculate" button (manual trigger)
- Last updated timestamp

### Status:  Pending

---

## PHASE 7: Estimator Integration

### Logic
```typescript
// Fallback chain: Building  Community  Municipality  Area
function getAdjustmentValue(buildingId, type) {
  return building.value || community.value || municipality.value || area.value;
}
```

### Status:  Pending

---

## PHASE 8: Display Integration

### Locations
- Building landing page
- Listing cards
- Listing detail page

### Status:  Pending

---

## Progress Tracker

| Phase | Task | Status |
|-------|------|--------|
| 1 | Parking Monthly (Lease) |  DONE |
| 2 | Locker Monthly (Lease) |  NEXT |
| 3 | Parking Price (Sale) |  |
| 4 | Locker Price (Sale) |  |
| 5 | Database table |  |
| 6 | Admin UI |  |
| 7 | Estimator integration |  |
| 8 | Display integration |  |
