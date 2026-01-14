$token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ2ZW5kb3IvdHJyZWIvNjEwOSIsImF1ZCI6IkFtcFVzZXJzUHJkIiwicm9sZXMiOlsiQW1wVmVuZG9yIl0sImlzcyI6InByb2QuYW1wcmUuY2EiLCJleHAiOjI1MzQwMjMwMDc5OSwiaWF0IjoxNzU2OTk1NTcwLCJzdWJqZWN0VHlwZSI6InZlbmRvciIsInN1YmplY3RLZXkiOiI2MTA5IiwianRpIjoiZDk5YWJiMzZhMjM1M2NmNyIsImN1c3RvbWVyTmFtZSI6InRycmViIn0.mGTXA0sGgERAf8rV4yOUrjuwwN7V_NlC1BQfVU9D3ZM"

$found = @()
$skip = 0

while ($found.Count -lt 10 -and $skip -lt 50000) {
    $url = "https://query.ampre.ca/odata/Property?`$filter=PropertyType eq 'Condo Apt' and (TransactionType eq 'For Lease' or StandardStatus eq 'Leased') and City eq 'Toronto C01'&`$select=StreetNumber,StreetName,UnitNumber,ParkingMonthlyCost&`$top=500&`$skip=$skip"
    
    $r = Invoke-RestMethod -Uri $url -Headers @{Authorization = "Bearer $token"} -Method Get
    
    if ($r.value.Count -eq 0) { 
        Write-Host "No more records at skip=$skip" -ForegroundColor Red
        break 
    }
    
    $withParking = $r.value | Where-Object { $_.ParkingMonthlyCost -gt 0 }
    $found += $withParking
    
    Write-Host "Skip=$skip | Batch=$($r.value.Count) | Found=$($withParking.Count) | Total=$($found.Count)" -ForegroundColor Cyan
    
    $skip += 500
}

Write-Host "`n=== FOUND $($found.Count) RECORDS ===" -ForegroundColor Green
$found | Select-Object -First 10 | ForEach-Object {
    Write-Host "$($_.StreetNumber) $($_.StreetName) #$($_.UnitNumber) | `$$($_.ParkingMonthlyCost)/mo" -ForegroundColor Yellow
}
