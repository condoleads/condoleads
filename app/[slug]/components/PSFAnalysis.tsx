// app/[slug]/components/PSFAnalysis.tsx
'use client';

import { TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';

interface BuildingSummary {
  saleAvgPsf: number | null;
  saleCount: number;
  leaseAvgPsf: number | null;
  leaseCount: number;
}

interface GeoLevel {
  id: string;
  name: string;
  salePsf: { avg: number | null; sampleSize: number } | null;
  leasePsf: { avg: number | null; sampleSize: number } | null;
}

interface Props {
  buildingName: string;
  buildingSummary: BuildingSummary | null;
  community: GeoLevel | null;
  municipality: GeoLevel | null;
  area: GeoLevel | null;
}

function calculateDiff(buildingVal: number | null, compareVal: number | null): number | null {
  if (!buildingVal || !compareVal) return null;
  return ((buildingVal - compareVal) / compareVal) * 100;
}

function getValueDescription(diff: number | null): { text: string; sentiment: 'positive' | 'negative' | 'neutral' } {
  if (diff === null) return { text: '', sentiment: 'neutral' };
  if (diff < -10) return { text: 'significantly below', sentiment: 'positive' };
  if (diff < -3) return { text: 'below', sentiment: 'positive' };
  if (diff > 10) return { text: 'significantly above', sentiment: 'negative' };
  if (diff > 3) return { text: 'above', sentiment: 'negative' };
  return { text: 'in line with', sentiment: 'neutral' };
}

function getActivityLevel(count: number): string {
  if (count >= 100) return 'very high';
  if (count >= 50) return 'high';
  if (count >= 20) return 'moderate';
  if (count >= 10) return 'steady';
  return 'limited';
}

function getYieldInsight(salePsf: number | null, leasePsf: number | null): string | null {
  if (!salePsf || !leasePsf) return null;
  const annualRentPsf = leasePsf * 12;
  const grossYield = (annualRentPsf / salePsf) * 100;
  
  if (grossYield >= 5) return `strong rental yield of ${grossYield.toFixed(1)}%`;
  if (grossYield >= 4) return `solid rental yield of ${grossYield.toFixed(1)}%`;
  if (grossYield >= 3) return `moderate rental yield of ${grossYield.toFixed(1)}%`;
  return `rental yield of ${grossYield.toFixed(1)}%`;
}

export default function PSFAnalysis({ 
  buildingName, 
  buildingSummary, 
  community, 
  municipality, 
  area 
}: Props) {
  if (!buildingSummary || (!buildingSummary.saleAvgPsf && !buildingSummary.leaseAvgPsf)) {
    return null;
  }

  const buildingSalePsf = buildingSummary.saleAvgPsf;
  const buildingLeasePsf = buildingSummary.leaseAvgPsf;
  const totalTransactions = buildingSummary.saleCount + buildingSummary.leaseCount;

  // Calculate differences
  const communitySaleDiff = calculateDiff(buildingSalePsf, community?.salePsf?.avg || null);
  const municipalitySaleDiff = calculateDiff(buildingSalePsf, municipality?.salePsf?.avg || null);
  const areaSaleDiff = calculateDiff(buildingSalePsf, area?.salePsf?.avg || null);

  const communityLeaseDiff = calculateDiff(buildingLeasePsf, community?.leasePsf?.avg || null);

  // Build insights
  const insights: string[] = [];

  // Sale price insight
  if (buildingSalePsf && community?.salePsf?.avg) {
    const desc = getValueDescription(communitySaleDiff);
    const diffText = communitySaleDiff !== null ? `(${communitySaleDiff > 0 ? '+' : ''}${communitySaleDiff.toFixed(0)}%)` : '';
    insights.push(
      `Sale prices at ${buildingName} average **$${Math.round(buildingSalePsf)}/sqft**, which is ${desc.text} the ${community.name} community average of $${Math.round(community.salePsf.avg)}/sqft ${diffText}.`
    );
  }

  // Area comparison
  if (buildingSalePsf && area?.salePsf?.avg && areaSaleDiff !== null) {
    const areaDesc = getValueDescription(areaSaleDiff);
    if (areaDesc.sentiment === 'positive') {
      insights.push(
        `This represents good value compared to the broader ${area.name} area ($${Math.round(area.salePsf.avg)}/sqft).`
      );
    } else if (areaDesc.sentiment === 'negative') {
      insights.push(
        `Prices here are premium compared to the broader ${area.name} area ($${Math.round(area.salePsf.avg)}/sqft).`
      );
    }
  }

  // Rental insight
  if (buildingLeasePsf && community?.leasePsf?.avg) {
    const leaseDesc = getValueDescription(communityLeaseDiff);
    const yieldText = getYieldInsight(buildingSalePsf, buildingLeasePsf);
    
    if (leaseDesc.sentiment === 'positive') {
      insights.push(
        `Rental rates are competitive at **$${buildingLeasePsf.toFixed(2)}/sqft monthly**, ${Math.abs(communityLeaseDiff || 0).toFixed(0)}% below the community average${yieldText ? `, offering ${yieldText}` : ''}.`
      );
    } else if (leaseDesc.sentiment === 'negative') {
      insights.push(
        `Rental rates are strong at **$${buildingLeasePsf.toFixed(2)}/sqft monthly**, ${Math.abs(communityLeaseDiff || 0).toFixed(0)}% above the community average${yieldText ? `, with ${yieldText}` : ''}.`
      );
    } else if (yieldText) {
      insights.push(
        `The building offers ${yieldText} based on current sale and lease prices.`
      );
    }
  }

  // Activity insight
  if (totalTransactions > 0) {
    const activityLevel = getActivityLevel(totalTransactions);
    insights.push(
      `The building has seen **${buildingSummary.saleCount} sales** and **${buildingSummary.leaseCount} leases** in recent transactions, indicating ${activityLevel} market activity.`
    );
  }

  if (insights.length === 0) return null;

  // Determine overall sentiment icon
  const overallSentiment = communitySaleDiff !== null 
    ? (communitySaleDiff < -3 ? 'positive' : communitySaleDiff > 3 ? 'negative' : 'neutral')
    : 'neutral';

  const SentimentIcon = overallSentiment === 'positive' 
    ? TrendingDown 
    : overallSentiment === 'negative' 
    ? TrendingUp 
    : Minus;

  const sentimentColor = overallSentiment === 'positive'
    ? 'text-green-600 bg-green-50'
    : overallSentiment === 'negative'
    ? 'text-red-600 bg-red-50'
    : 'text-slate-600 bg-slate-50';

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Market Analysis</h3>
      
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 p-5">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-lg ${sentimentColor}`}>
            <BarChart3 className="w-5 h-5" />
          </div>
          
          <div className="flex-1 space-y-3">
            {insights.map((insight, i) => (
              <p key={i} className="text-slate-700 leading-relaxed">
                {insight.split('**').map((part, j) => 
                  j % 2 === 1 
                    ? <strong key={j} className="text-slate-900">{part}</strong> 
                    : part
                )}
              </p>
            ))}
          </div>
        </div>

        {/* Quick Stats Summary */}
        <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4">
          {buildingSalePsf && (
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Avg Sale PSF</p>
              <p className="text-lg font-bold text-slate-900">${Math.round(buildingSalePsf)}</p>
            </div>
          )}
          {buildingLeasePsf && (
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Avg Lease PSF</p>
              <p className="text-lg font-bold text-slate-900">${buildingLeasePsf.toFixed(2)}/mo</p>
            </div>
          )}
          {buildingSalePsf && buildingLeasePsf && (
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Gross Yield</p>
              <p className="text-lg font-bold text-emerald-600">
                {((buildingLeasePsf * 12 / buildingSalePsf) * 100).toFixed(1)}%
              </p>
            </div>
          )}
          <div className="text-center">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Transactions</p>
            <p className="text-lg font-bold text-slate-900">{totalTransactions}</p>
          </div>
        </div>
      </div>
    </div>
  );
}