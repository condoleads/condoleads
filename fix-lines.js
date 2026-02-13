const fs = require('fs');
const lines = fs.readFileSync('app/estimator/components/HomeEstimatorResults.tsx', 'utf8').split('\n');

// Build strings without template literal conflicts
const line94 = "      ? \x60Received estimate for \x24{buildingName}\x24{unitNumber ? \x60 \u2014 \x24{unitNumber}\x60 : ''}\x24{buildingAddress ? \x60 (\x24{buildingAddress})\x60 : ''}: \x24{formatPrice(result.estimatedPrice)} (\x24{formatPrice(result.priceRange.low)} - \x24{formatPrice(result.priceRange.high)}). \x24{specs.bedrooms || 'N/A'}BR/\x24{specs.bathrooms || 'N/A'}BA, \x24{specs.livingAreaRange || 'N/A'} sqft. Confidence: \x24{result.confidence}. Would like to discuss accurate valuation.\x60";

const line95 = "      : \x60Requesting valuation for \x24{buildingName}\x24{unitNumber ? \x60 \u2014 \x24{unitNumber}\x60 : ''}\x24{buildingAddress ? \x60 (\x24{buildingAddress})\x60 : ''}. \x24{specs.bedrooms || 'N/A'}BR/\x24{specs.bathrooms || 'N/A'}BA, \x24{specs.livingAreaRange || 'N/A'} sqft. Property requires professional analysis - no automated estimate available.\x60";

lines[93] = line94;
lines[94] = line95;
fs.writeFileSync('app/estimator/components/HomeEstimatorResults.tsx', lines.join('\n'));
console.log('Fixed:');
console.log(lines[93]);
console.log(lines[94]);
