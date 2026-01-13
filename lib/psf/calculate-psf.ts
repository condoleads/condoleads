// lib/psf/calculate-psf.ts

/**
 * Core PSF calculation logic
 * Groups by geography + month, segments by parking
 */

import { PropTxRecord } from './fetch-proptx';
import { getSqft, SqftResult } from './extraction';

export interface ProcessedRecord {
  closePrice: number;
  closeDate: Date;
  year: number;
  month: number;
  periodKey: string;
  sqft: number;
  sqftMethod: 'exact' | 'midpoint' | 'fallback';
  psf: number;
  hasParking: boolean;
  parkingTotal: number;
  area: string | null;
  municipality: string | null;
  community: string | null;
  buildingKey: string | null;
}

export interface PeriodMetrics {
  periodKey: string;
  year: number;
  month: number;
  periodStart: Date;
  periodEnd: Date;
  
  all: SegmentMetrics;
  withParking: SegmentMetrics;
  withoutParking: SegmentMetrics;
  
  parkingPremiumPsf: number | null;
  parkingPremiumPct: number | null;
  
  exactCount: number;
  midpointCount: number;
  fallbackCount: number;
}

export interface SegmentMetrics {
  avgPsf: number | null;
  medianPsf: number | null;
  minPsf: number | null;
  maxPsf: number | null;
  stddevPsf: number | null;
  sampleSize: number;
  totalValue: number;
  totalSqft: number;
}

/**
 * Process raw PropTx records into calculated PSF records
 */
export function processRecords(records: PropTxRecord[]): ProcessedRecord[] {
  const processed: ProcessedRecord[] = [];

  for (const record of records) {
    if (!record.ClosePrice || !record.CloseDate) continue;

    const sqftResult = getSqft(record.SquareFootSource, record.LivingAreaRange);
    const psf = record.ClosePrice / sqftResult.sqft;

    const closeDate = new Date(record.CloseDate);
    const year = closeDate.getFullYear();
    const month = closeDate.getMonth() + 1;

    // Build building key from address
    const buildingKey = record.StreetNumber && record.StreetName
      ? `${record.StreetNumber}|${record.StreetName.split(' ')[0].toUpperCase()}`
      : null;

    processed.push({
      closePrice: record.ClosePrice,
      closeDate,
      year,
      month,
      periodKey: `${year}-${month.toString().padStart(2, '0')}`,
      sqft: sqftResult.sqft,
      sqftMethod: sqftResult.method,
      psf,
      hasParking: (record.ParkingTotal || 0) > 0,
      parkingTotal: record.ParkingTotal || 0,
      area: record.CountyOrParish,
      municipality: record.City,
      community: record.CityRegion,
      buildingKey,
    });
  }

  return processed;
}

/**
 * Group records by period (year-month) and calculate metrics
 */
export function calculatePeriodMetrics(records: ProcessedRecord[]): PeriodMetrics[] {
  // Group by period
  const byPeriod = new Map<string, ProcessedRecord[]>();
  
  for (const record of records) {
    const existing = byPeriod.get(record.periodKey) || [];
    existing.push(record);
    byPeriod.set(record.periodKey, existing);
  }

  // Calculate metrics for each period
  const results: PeriodMetrics[] = [];

  for (const [periodKey, periodRecords] of byPeriod) {
    const [yearStr, monthStr] = periodKey.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0);

    const withParking = periodRecords.filter(r => r.hasParking);
    const withoutParking = periodRecords.filter(r => !r.hasParking);

    const allMetrics = calculateSegmentMetrics(periodRecords);
    const parkingMetrics = calculateSegmentMetrics(withParking);
    const noParkingMetrics = calculateSegmentMetrics(withoutParking);

    // Calculate parking premium
    let parkingPremiumPsf: number | null = null;
    let parkingPremiumPct: number | null = null;

    if (parkingMetrics.avgPsf && noParkingMetrics.avgPsf && 
        parkingMetrics.sampleSize >= 3 && noParkingMetrics.sampleSize >= 3) {
      parkingPremiumPsf = Math.round((parkingMetrics.avgPsf - noParkingMetrics.avgPsf) * 100) / 100;
      parkingPremiumPct = Math.round(((parkingMetrics.avgPsf / noParkingMetrics.avgPsf) - 1) * 10000) / 100;
    }

    // Count sqft methods
    const exactCount = periodRecords.filter(r => r.sqftMethod === 'exact').length;
    const midpointCount = periodRecords.filter(r => r.sqftMethod === 'midpoint').length;
    const fallbackCount = periodRecords.filter(r => r.sqftMethod === 'fallback').length;

    results.push({
      periodKey,
      year,
      month,
      periodStart,
      periodEnd,
      all: allMetrics,
      withParking: parkingMetrics,
      withoutParking: noParkingMetrics,
      parkingPremiumPsf,
      parkingPremiumPct,
      exactCount,
      midpointCount,
      fallbackCount,
    });
  }

  // Sort by period descending
  return results.sort((a, b) => b.periodKey.localeCompare(a.periodKey));
}

/**
 * Calculate metrics for a segment of records
 */
function calculateSegmentMetrics(records: ProcessedRecord[]): SegmentMetrics {
  if (records.length === 0) {
    return {
      avgPsf: null,
      medianPsf: null,
      minPsf: null,
      maxPsf: null,
      stddevPsf: null,
      sampleSize: 0,
      totalValue: 0,
      totalSqft: 0,
    };
  }

  const psfValues = records.map(r => r.psf).sort((a, b) => a - b);
  const totalValue = records.reduce((sum, r) => sum + r.closePrice, 0);
  const totalSqft = records.reduce((sum, r) => sum + r.sqft, 0);

  const avgPsf = totalValue / totalSqft;
  const medianPsf = calculateMedian(psfValues);
  const minPsf = psfValues[0];
  const maxPsf = psfValues[psfValues.length - 1];
  const stddevPsf = calculateStdDev(psfValues, avgPsf);

  return {
    avgPsf: Math.round(avgPsf * 100) / 100,
    medianPsf: Math.round(medianPsf * 100) / 100,
    minPsf: Math.round(minPsf * 100) / 100,
    maxPsf: Math.round(maxPsf * 100) / 100,
    stddevPsf: stddevPsf ? Math.round(stddevPsf * 100) / 100 : null,
    sampleSize: records.length,
    totalValue: Math.round(totalValue * 100) / 100,
    totalSqft,
  };
}

function calculateMedian(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function calculateStdDev(values: number[], mean: number): number | null {
  if (values.length < 2) return null;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Group records by geography level
 */
export function groupByGeography(
  records: ProcessedRecord[],
  level: 'area' | 'municipality' | 'community' | 'building'
): Map<string, ProcessedRecord[]> {
  const grouped = new Map<string, ProcessedRecord[]>();

  for (const record of records) {
    let key: string | null = null;

    switch (level) {
      case 'area':
        key = record.area;
        break;
      case 'municipality':
        key = record.municipality;
        break;
      case 'community':
        key = record.community;
        break;
      case 'building':
        key = record.buildingKey;
        break;
    }

    if (!key) continue;

    const existing = grouped.get(key) || [];
    existing.push(record);
    grouped.set(key, existing);
  }

  return grouped;
}
