// lib/email/charlie-plan-email-html.ts
//
// C-CHARLIE-FOLLOWUP B(i) (2026-06-13) — extracted from
// app/api/charlie/plan-email/route.ts so the test-render probe at
// app/api/charlie/_test-render-plan-email/route.ts can import the SAME
// builder the live POST handler uses without violating Next.js`s rule
// that route files may only export HTTP handlers + config.
//
// W-CHARLIE-CONVERGENCE CV-2 (2026-06-14) — email parity. The email now
// renders the Property Estimate price card + 4-row tier rail (P/G/S/B with
// anchor highlight) that the lead page (CV-1) and the in-chat panel
// already showed. Tier color/label literals migrated to CV-0
// (lib/charlie/tier-chip.ts) — the inline TIER_COLORS_EMAIL,
// HOME_LABELS_EMAIL, CONDO_LABELS_EMAIL declarations are GONE. This is the
// 2nd of 4 tier-chip duplications killed (after CV-1 hit
// CharlieLeadEstimate). The two remaining are in the in-chat React
// surfaces (ComparableCard, SellerEstimateBlock) — flagged for a future
// cleanup pass; out of CV-2 scope.

import { buildSellerEstimateView } from '@/lib/charlie/seller-estimate-view'
import { TIER_META, TIER_ORDER, tierChipFor } from '@/lib/charlie/tier-chip'
import { buildPropertySlug } from '@/lib/utils/property-slug'

const MONTHS_ARR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// C-CHARLIE-FOLLOWUP B(i) (2026-06-13): exported so the test-render probe
// endpoint (app/api/charlie/_test-render-plan-email/route.ts) can invoke
// the same builder the live POST handler uses, without re-implementing it.
// Behavior identical — only the export keyword is added.
export function buildRichPlanEmail(data: {
  userName: string
  userEmail: string
  planType: string
  plan: any
  analytics: any
  listings: any[]
  agent: any
  geoName: string | null
  comparables: any[]
  sellerEstimate: any | null
  vipCreditUsed: boolean
  vipCreditPlansUsed: number
  vipCreditTotal: number
  blocks: any[]
  brandName: string
  domain: string
  baseUrl: string
  sourceUrl?: string | null
  // W-CHARLIE-BUYER-CHUNK2 (2026-06-15): server-derived buyer tax-band
  // (null on seller plans; isEmpty=true when the matched-listing set
  // has fewer than 3 with-tax samples). Replaces the prior buyer-side
  // Tax-Matched rendering from sellerEstimate (which was state-leak;
  // Chunk 1 nulled the input).
  buyerTaxMatch?: import('@/lib/charlie/buyer-tax-match').BuyerTaxMatch | null
}): string {
  const { userName, planType, plan, analytics, listings, agent, geoName, comparables, sellerEstimate, vipCreditUsed, vipCreditPlansUsed, vipCreditTotal, blocks, brandName, domain, baseUrl, sourceUrl, buyerTaxMatch } = data
  const isBuyer = planType === 'buyer'
  const topListings = (listings || []).slice(0, 10)

  const stl = analytics?.sale_to_list_ratio ? Number(analytics.sale_to_list_ratio) : null
  const dom = analytics?.closed_avg_dom_90 ? Number(analytics.closed_avg_dom_90) : null
  const conditionLabel = !stl || !dom ? 'Insufficient Data'
    : stl >= 99 && dom <= 20 ? "Strong Seller's Market"
    : stl >= 97 && dom <= 40 ? "Seller's Market"
    : stl < 95 || dom > 70 ? "Buyer's Market"
    : 'Balanced Market'
  const conditionColor = !stl || !dom ? '#94a3b8'
    : stl >= 97 ? '#10b981'
    : stl < 95 || (dom && dom > 70) ? '#ef4444'
    : '#f59e0b'

  const blocksHtml = (blocks || []).length > 0 ? (() => {
    const parts: string[] = []
    for (const block of (blocks || [])) {
      if (block.type === 'analytics') {
        parts.push(`<div style="margin:16px 0;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Market Intelligence &middot; ${block.geoName}</div>
          <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size:13px;">
            <tr><td style="color:#64748b;width:160px;">Avg DOM</td><td style="font-weight:700;color:#0f172a;">${block.data?.closed_avg_dom_90 ? block.data.closed_avg_dom_90 + 'd' : '&mdash;'}</td></tr>
            <tr><td style="color:#64748b;">Sale/List</td><td style="font-weight:700;color:#0f172a;">${block.data?.sale_to_list_ratio ? block.data.sale_to_list_ratio + '%' : '&mdash;'}</td></tr>
            <tr><td style="color:#64748b;">Active</td><td style="font-weight:700;color:#0f172a;">${block.data?.active_count || '&mdash;'}</td></tr>
          </table>
        </div>`)
      }
      if (block.type === 'buildings') {
        parts.push(`<div style="margin:16px 0;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Buildings Found &middot; ${block.label} &middot; ${block.buildings.length}</div>
          ${(block.buildings || []).slice(0, 8).map((b: any) => `
            <a href="${b.url || baseUrl}" style="display:block;text-decoration:none;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:6px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                ${b.photo ? `<td width="48"><img src="${b.photo}" width="48" height="48" style="border-radius:6px;object-fit:cover;"></td>` : ''}
                <td style="padding-left:10px;vertical-align:middle;">
                  <div style="font-size:13px;font-weight:700;color:#0f172a;">${b.buildingName}</div>
                  <div style="font-size:12px;color:#64748b;">${b.medianPrice ? '$' + Number(b.medianPrice).toLocaleString('en-CA') : ''}${b.medianPsf ? ' &middot; $' + b.medianPsf + '/sqft' : ''}</div>
                </td>
                <td style="text-align:right;vertical-align:middle;">
                  ${b.activeCount > 0 ? `<span style="background:#10b981;color:#fff;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700;">${b.activeCount} active</span>` : ''}
                </td>
              </tr></table>
            </a>
          `).join('')}
        </div>`)
      }
      if (block.type === 'rankings' && block.data?.rankings?.length > 0) {
        const title = (block.data.ranking_type || block.rankType || '').split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
        parts.push(`<div style="margin:16px 0;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">${title}</div>
          ${(block.data.rankings || []).slice(0, 5).map((r: any) => `
            <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f1f5f9;">
              <a href="${r.url || baseUrl}" style="font-size:13px;font-weight:600;color:#1d4ed8;text-decoration:none;">#${r.rank} ${r.entity_name}</a>
              <span style="font-size:12px;color:#64748b;">${r.median_price ? '$' + Number(r.median_price).toLocaleString('en-CA') : ''}${r.gross_yield ? ' &middot; ' + r.gross_yield.toFixed(1) + '% yield' : ''}</span>
            </div>
          `).join('')}
        </div>`)
      }
      if (block.type === 'priceTrends' && block.data?.current_median_sale) {
        parts.push(`<div style="margin:16px 0;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Price Trends</div>
          <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size:13px;">
            <tr><td style="color:#64748b;width:160px;">Median Price</td><td style="font-weight:700;color:#1d4ed8;">$${Number(block.data.current_median_sale).toLocaleString('en-CA')}</td></tr>
            ${block.data.current_avg_psf ? `<tr><td style="color:#64748b;">Avg PSF</td><td style="font-weight:700;color:#0f172a;">$${Number(block.data.current_avg_psf).toLocaleString('en-CA')}/sqft</td></tr>` : ''}
            ${block.data.psf_trend_pct != null ? `<tr><td style="color:#64748b;">PSF Trend</td><td style="font-weight:700;color:${block.data.psf_trend_pct >= 0 ? '#10b981' : '#ef4444'};">${block.data.psf_trend_pct > 0 ? '+' : ''}${block.data.psf_trend_pct.toFixed(1)}%</td></tr>` : ''}
          </table>
        </div>`)
      }
    }
    return parts.length > 0 ? `<div style="margin:20px 0;"><div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">Your Research</div>${parts.join('')}</div>` : ''
  })() : ''

  const conditionHtml = `
    <div style="margin: 0 0 16px;">
      <span style="display: inline-flex; align-items: center; gap: 8px; background: ${conditionColor}18; border: 1px solid ${conditionColor}40; border-radius: 100px; padding: 5px 14px;">
        <span style="width: 7px; height: 7px; border-radius: 50%; background: ${conditionColor}; display: inline-block;"></span>
        <span style="font-size: 12px; font-weight: 700; color: ${conditionColor};">${conditionLabel}</span>
      </span>
    </div>
  `

  const marketHtml = analytics ? `
    <div style="margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Market Intelligence &middot; ${geoName || ''}</div>
      <table width="100%" cellpadding="0" cellspacing="8" border="0" style="margin-bottom: 8px;">
        <tr>
          ${[
            { label: 'Avg Days on Market', value: analytics.closed_avg_dom_90 ? `${analytics.closed_avg_dom_90}d` : '&mdash;' },
            { label: 'Sale / List Ratio', value: analytics.sale_to_list_ratio ? `${analytics.sale_to_list_ratio}%` : '&mdash;' },
            { label: 'Active Listings', value: analytics.active_count ? `${Number(analytics.active_count).toLocaleString()}` : '&mdash;' },
          ].map(m => `
            <td width="33%" style="padding: 0 4px;">
              <div style="background: #f1f5f9; border-radius: 10px; padding: 12px; text-align: center;">
                <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">${m.label}</div>
                <div style="font-size: 18px; font-weight: 800; color: #0f172a;">${m.value}</div>
              </div>
            </td>
          `).join('')}
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="8" border="0">
        <tr>
          ${[
            { label: 'Sold (90d)', value: analytics.closed_sale_count_90 ? `${Number(analytics.closed_sale_count_90).toLocaleString()}` : '&mdash;' },
            { label: 'Absorption Rate', value: analytics.absorption_rate_pct ? `${analytics.absorption_rate_pct}%` : '&mdash;' },
            { label: 'Median PSF', value: analytics.median_psf ? `$${Number(analytics.median_psf).toLocaleString('en-CA', { maximumFractionDigits: 0 })}` : '&mdash;' },
          ].map(m => `
            <td width="33%" style="padding: 0 4px;">
              <div style="background: #f1f5f9; border-radius: 10px; padding: 12px; text-align: center;">
                <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;">${m.label}</div>
                <div style="font-size: 18px; font-weight: 800; color: #0f172a;">${m.value}</div>
              </div>
            </td>
          `).join('')}
        </tr>
      </table>
    </div>
    ${analytics.subtype_breakdown && Object.keys(analytics.subtype_breakdown).length > 0 ? `
    <div style="margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Price by Home Type</div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
        <tr style="background: #f8fafc;">
          <td style="padding: 8px 10px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Type</td>
          <td style="padding: 8px 10px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; text-align: center;">DOM</td>
          <td style="padding: 8px 10px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; text-align: center;">STL</td>
          <td style="padding: 8px 10px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; text-align: right;">Median</td>
        </tr>
        ${Object.entries(analytics.subtype_breakdown).map(([subtype, d]: [string, any]) => `
        <tr style="border-top: 1px solid #f1f5f9;">
          <td style="padding: 9px 10px; font-size: 13px; font-weight: 600; color: #0f172a;">${subtype}</td>
          <td style="padding: 9px 10px; font-size: 12px; color: #64748b; text-align: center;">${d.avg_dom ? `${Math.round(d.avg_dom)}d` : '&mdash;'}</td>
          <td style="padding: 9px 10px; font-size: 12px; color: #64748b; text-align: center;">${d.sale_to_list ? `${d.sale_to_list}%` : '&mdash;'}</td>
          <td style="padding: 9px 10px; font-size: 14px; font-weight: 800; color: #1d4ed8; text-align: right;">${d.median_price ? `$${Number(d.median_price).toLocaleString('en-CA')}` : '&mdash;'}</td>
        </tr>
        `).join('')}
      </table>
    </div>
    ` : ''}
  ` : ''

  const offerIntelHtml = analytics ? `
    <div style="margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Offer Intelligence</div>
      <table width="100%" cellpadding="0" cellspacing="4" border="0"><tr>
        <td width="33%" style="padding: 0 4px;"><div style="background: #f1f5f9; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Offer At</div>
          <div style="font-size: 18px; font-weight: 800; color: #1d4ed8;">${analytics.sale_to_list_ratio ? Number(analytics.sale_to_list_ratio).toFixed(1) + '%' : '&mdash;'}</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">of asking</div>
        </div></td>
        <td width="33%" style="padding: 0 4px;"><div style="background: #f1f5f9; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Avg Concession</div>
          <div style="font-size: 18px; font-weight: 800; color: #10b981;">${analytics.avg_concession_pct ? Number(analytics.avg_concession_pct).toFixed(1) + '%' : '&mdash;'}</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">below asking</div>
        </div></td>
        <td width="33%" style="padding: 0 4px;"><div style="background: #f1f5f9; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Decide In</div>
          <div style="font-size: 18px; font-weight: 800; color: #f59e0b;">${analytics.closed_avg_dom_90 ? Number(analytics.closed_avg_dom_90).toFixed(0) + 'd' : '&mdash;'}</div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">avg DOM</div>
        </div></td>
      </tr></table>
    </div>
  ` : ''

  const seasonal = analytics?.insight_seasonal
  const bestMonths = (seasonal?.best_months || []) as number[]
  const worstMonths = (seasonal?.worst_months || []) as number[]
  const currentMonth = seasonal?.current_month as number | undefined
  const bestTimeHtml = seasonal ? `
    <div style="margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Best Time to Buy</div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px;">
        <div style="font-size: 13px; color: #1e293b; line-height: 1.7;">
          Best months: <strong style="color: #10b981;">${bestMonths.map((m: number) => MONTHS_ARR[m-1]).join(', ')}</strong> &nbsp;&middot;&nbsp;
          Avoid: <strong style="color: #ef4444;">${worstMonths.map((m: number) => MONTHS_ARR[m-1]).join(', ')}</strong>
          ${currentMonth ? `<br>Currently <strong>${MONTHS_ARR[currentMonth-1]}</strong> &mdash; ranked #${seasonal.current_month_rank} of 12 for buyer power.` : ''}
        </div>
      </div>
    </div>
  ` : ''

  const summaryHtml = plan?.summary ? `
    <div style="background: linear-gradient(135deg, #eff6ff, #f0fdf4); border: 1px solid #bfdbfe; border-radius: 10px; padding: 18px; margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">&#10022; Your ${isBuyer ? 'Buyer' : 'Seller'} Strategy</div>
      <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #1e293b;">${plan.summary}</p>
    </div>
  ` : ''

  const profileHtml = isBuyer ? `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Buyer Profile</div>
      <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size: 13px;">
        ${plan?.budgetMax ? `<tr><td style="color: #64748b; width: 130px;">Budget</td><td style="font-weight: 700; color: #0f172a;">$${Number(plan.budgetMin || 0).toLocaleString('en-CA')} &mdash; $${Number(plan.budgetMax).toLocaleString('en-CA')}</td></tr>` : ''}
        ${plan?.propertyType ? `<tr><td style="color: #64748b;">Property Type</td><td style="font-weight: 600; color: #0f172a;">${plan.propertyType}</td></tr>` : ''}
        ${plan?.bedrooms ? `<tr><td style="color: #64748b;">Bedrooms</td><td style="font-weight: 600; color: #0f172a;">${plan.bedrooms}+</td></tr>` : ''}
        ${plan?.timeline ? `<tr><td style="color: #64748b;">Timeline</td><td style="font-weight: 600; color: #0f172a;">${plan.timeline}</td></tr>` : ''}
      </table>
    </div>
  ` : `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 16px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;">Seller Profile</div>
      <table width="100%" cellpadding="4" cellspacing="0" border="0" style="font-size: 13px;">
        ${plan?.propertyType ? `<tr><td style="color: #64748b; width: 130px;">Property Type</td><td style="font-weight: 600; color: #0f172a;">${plan.propertyType}</td></tr>` : ''}
        ${plan?.estimatedValueMin ? `<tr><td style="color: #64748b;">Est. Value</td><td style="font-weight: 700; color: #059669;">$${Number(plan.estimatedValueMin).toLocaleString('en-CA')} &mdash; $${Number(plan.estimatedValueMax).toLocaleString('en-CA')}</td></tr>` : ''}
        ${plan?.timeline ? `<tr><td style="color: #64748b;">Timeline</td><td style="font-weight: 600; color: #0f172a;">${plan.timeline}</td></tr>` : ''}
        ${plan?.goal ? `<tr><td style="color: #64748b;">Goal</td><td style="font-weight: 600; color: #0f172a;">${plan.goal}</td></tr>` : ''}
      </table>
    </div>
  `

  const planCardHtml = `
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; margin: 20px 0;">
      <div style="margin-bottom: 12px;">
        <div style="font-size: 16px; font-weight: 800; color: #fff;">${isBuyer ? '&#127968; Your Buyer Plan' : '&#128176; Your Seller Strategy'}</div>
        <div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 2px;">${geoName || 'GTA'} &middot; ${new Date().toLocaleDateString('en-CA')}</div>
      </div>
      <div style="margin-bottom: 14px;">
        <span style="display: inline-flex; align-items: center; gap: 6px; background: ${conditionColor}18; border: 1px solid ${conditionColor}40; border-radius: 100px; padding: 4px 12px;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: ${conditionColor}; display: inline-block;"></span>
          <span style="font-size: 11px; font-weight: 700; color: ${conditionColor};">${conditionLabel}</span>
        </span>
      </div>
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.2em; color: rgba(255,255,255,0.3); text-transform: uppercase; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06);">Your Profile</div>
      ${isBuyer && plan?.budgetMax ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Budget</span><span style="font-size:13px;font-weight:700;color:#3b82f6;">$${Number(plan.budgetMin||0).toLocaleString('en-CA')} &mdash; $${Number(plan.budgetMax).toLocaleString('en-CA')}</span></div>` : ''}
      ${plan?.propertyType ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Property Type</span><span style="font-size:13px;font-weight:700;color:#fff;">${plan.propertyType}</span></div>` : ''}
      ${plan?.timeline ? `<div style="display:flex;justify-content:space-between;padding:5px 0;"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Timeline</span><span style="font-size:13px;font-weight:700;color:#fff;">${plan.timeline}</span></div>` : ''}
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.2em; color: rgba(255,255,255,0.3); text-transform: uppercase; margin: 12px 0 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06);">Market Snapshot</div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Avg Days on Market</span><span style="font-size:13px;font-weight:700;color:#6366f1;">${analytics?.closed_avg_dom_90 ? analytics.closed_avg_dom_90 + 'd' : '&mdash;'}</span></div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Sale-to-List Ratio</span><span style="font-size:13px;font-weight:700;color:#10b981;">${analytics?.sale_to_list_ratio ? analytics.sale_to_list_ratio + '%' : '&mdash;'}</span></div>
      <div style="display:flex;justify-content:space-between;padding:5px 0;"><span style="font-size:12px;color:rgba(255,255,255,0.45);">Active Listings</span><span style="font-size:13px;font-weight:700;color:#fff;">${analytics?.active_count || '&mdash;'}</span></div>
      ${topListings.length > 0 ? `
      <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.2em; color: rgba(255,255,255,0.3); text-transform: uppercase; margin: 12px 0 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06);">Top Matches (${topListings.length})</div>
      ${topListings.map((l) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);"><div><div style="font-size:12px;font-weight:700;color:#fff;">$${Number(l.list_price||0).toLocaleString('en-CA')}</div><div style="font-size:11px;color:rgba(255,255,255,0.35);">${(l.unparsed_address||'').split(',')[0]}</div></div><div style="font-size:11px;color:rgba(255,255,255,0.3);">${l.bedrooms_total||''} bed &middot; ${l.bathrooms_total_integer||''} bath</div></div>`).join('')}
      ` : ''}
    </div>
  `

  const listingsHtml = topListings.length > 0 ? `
    <div style="margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">
        ${isBuyer ? 'Matched Listings' : 'Comparable Sales'} (${topListings.length})
      </div>
      ${topListings.map((l: any) => {
        // W-CHARLIE-FINETUNE-FIX (2026-06-14): bare-MLS fallback (`/${key}`)
        // produces walliam.ca/x12345 — 404. Use the shared builder so the
        // email href matches Charlie's working descriptive-slug format
        // (curl-verified 200 vs prior 404). If the helper returns null
        // (no listingKey), fall back to baseUrl so the tile is still a
        // valid link to the brand root rather than a broken URL.
        const slug = l._slug || buildPropertySlug({
          listingKey: l.listing_key,
          unparsedAddress: l.unparsed_address,
          propertySubtype: l.property_subtype,
          unitNumber: l.unit_number,
        })
        const url = slug ? `${baseUrl}${slug.startsWith('/') ? slug : '/' + slug}` : baseUrl
        const price = l.list_price || l.close_price || 0
        const address = l.unparsed_address || '&mdash;'
        const beds = l.bedrooms_total
        const baths = l.bathrooms_total_integer
        const subtype = l.property_subtype || ''
        const photo = (l.media && l.media[0]?.media_url) || ''
        return `
          <a href="${url}" style="display: block; text-decoration: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                ${photo ? `<td width="80" style="vertical-align: top;"><img src="${photo}" alt="" width="80" height="72" style="display: block; width: 80px; height: 72px;"></td>` : ''}
                <td style="padding: 10px 14px; vertical-align: middle;">
                  <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${address}</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 3px;">
                    ${[beds ? `${beds} bed` : '', baths ? `${baths} bath` : '', subtype].filter(Boolean).join(' &middot; ')}
                  </div>
                </td>
                <td style="padding: 10px 14px; text-align: right; white-space: nowrap; vertical-align: middle;">
                  <div style="font-size: 16px; font-weight: 800; color: #1d4ed8;">$${Number(price).toLocaleString('en-CA')}</div>
                  <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">View &rarr;</div>
                </td>
              </tr>
            </table>
          </a>
        `
      }).join('')}
    </div>
  ` : ''

  // W-CHARLIE-CONVERGENCE CV-2 (2026-06-14): the previous inline
  // TIER_COLORS_EMAIL / HOME_LABELS_EMAIL / CONDO_LABELS_EMAIL declarations
  // (8 lines + 4 hex literals + 8 label entries) are GONE. tierChipFor +
  // TIER_META + TIER_ORDER come from lib/charlie/tier-chip.ts (CV-0). The
  // hex / label / marker values are byte-identical (CV-0 cited it; CV-1 +
  // CV-2 smokes assert the rendered output unchanged).
  //
  // Build the canonical view once. buildSellerEstimateView is pure (no
  // React, no DOM); CV-0 STEP 2 made it safe to import here. View is null
  // for buyer plans / no-sellerEstimate paths — priceCardHtml and
  // tierRailHtml below silent-skip in that case (gate on view?.present.*).
  const view = buildSellerEstimateView({ planType, plan, analytics, sellerEstimate })
  const sellerPath: 'condo' | 'home' = view?.path ?? (sellerEstimate?.path === 'home' ? 'home' : 'condo')
  const bestGeoTier = sellerEstimate?.estimate?.bestGeoTier as string | undefined
  const validGeoTier = bestGeoTier && bestGeoTier !== 'none' ? bestGeoTier : null
  // tierChipHtml: per-tile chip with the CV-0 anchor-fallback rule baked in.
  // Callers pass c.sourceTier directly; tierChipFor falls back to the geo
  // anchor (validGeoTier) when sourceTier is absent. Returns '' when neither
  // is a valid TierName.
  function tierChipHtml(tier: string | null | undefined): string {
    const chip = tierChipFor(tier ?? null, validGeoTier ?? null, sellerPath)
    if (!chip) return ''
    return `<div style="font-size:9px;font-weight:700;color:#fff;background:${chip.color};display:inline-block;padding:2px 6px;border-radius:3px;margin-bottom:4px;">${chip.marker} ${chip.label} &middot; ${chip.sub}</div>`
  }

  const sellerComps = sellerEstimate?.comparables || comparables || []
  const comparableSoldHtml = sellerComps.length > 0 ? `
    <div style="margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Comparable Sold (${sellerComps.length})</div>
      ${sellerComps.map((c: any) => {
        const price = c.closePrice || c.close_price || c.listPrice || c.list_price || 0
        const photo = c.mediaUrl || (c.media && c.media[0]?.media_url) || ''
        // W-CHARLIE-FINETUNE-FIX (2026-06-14): see listingsHtml above —
        // shared slug helper produces walliam.ca-resolvable urls. Falls
        // through to baseUrl if no listingKey (rare; honest non-link).
        const slugRaw = c._slug || buildPropertySlug({
          listingKey: c.listingKey || c.listing_key,
          unparsedAddress: c.unparsedAddress || c.unparsed_address,
          propertySubtype: c.propertySubtype || c.property_subtype,
          unitNumber: c.unitNumber || c.unit_number,
        })
        const slug = slugRaw ? (slugRaw.startsWith('/') ? slugRaw : '/' + slugRaw) : ''
        // Geo comps are mono-tier — chip falls back to validGeoTier (the
        // anchor) when the comp itself doesn't carry a sourceTier. Mirrors
        // EstimatorResults.tsx:616-617.
        const tileTier = c.sourceTier || validGeoTier
        return `
          <a href="${baseUrl}${slug}" style="display: block; text-decoration: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              ${photo ? `<td width="80" style="vertical-align: top;"><img src="${photo}" width="80" height="72" style="display:block;width:80px;height:72px;"><div style="background:${c.temperature === 'HOT' ? '#ef4444' : c.temperature === 'WARM' ? '#f59e0b' : '#3b82f6'};color:#fff;font-size:9px;font-weight:700;padding:2px 5px;margin-top:2px;text-align:center;">${c.temperature || 'SOLD'}</div></td>` : ''}
              <td style="padding: 10px 14px; vertical-align: middle;">
                ${tierChipHtml(tileTier)}
                <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${(c.unparsedAddress || c.unparsed_address || '').split(',')[0]}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 3px;">${[c.bedrooms_total ? c.bedrooms_total + ' bed' : '', c.bathrooms_total_integer ? c.bathrooms_total_integer + ' bath' : '', c.sqft ? c.sqft + ' sqft' : '', c.daysOnMarket ? c.daysOnMarket + 'd DOM' : ''].filter(Boolean).join(' &middot; ')}</div>
                ${c.matchQuality ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${c.matchQuality}</div>` : ''}
              </td>
              <td style="padding: 10px 14px; text-align: right; vertical-align: middle;">
                <div style="font-size: 16px; font-weight: 800; color: #059669;">$${Number(price).toLocaleString('en-CA')}</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Sold &rarr;</div>
              </td>
            </tr></table>
          </a>
        `
      }).join('')}
    </div>
  ` : ''

  // C-ENHANCE-2-RENDER — Tax-Matched subsection. Mounted between the
  // sold-comp block and the competing block (see body template below).
  // Heading "Tax-Matched (N)" — Charlie voice. Tiles reuse the comparable-
  // row template; each tile reads its own c.sourceTier (the multi-tier
  // display list stamps per tile, mirror of condo-comparable-matcher-
  // sales.ts L86-90). Optional inline subhead with the tax-matched
  // estimate + range.
  //
  // W-CHARLIE-EMAIL-FIX (2026-06-14): replace the silent-omit (was
  // `taxComps.length > 0 ? <…> : ""`) with an always-rendered section.
  // When the matcher returns no banded comps (home-comparable-matcher-
  // sales.ts:1352 returns undefined → empty taxMatch), the section now
  // shows an HONEST empty-state line instead of vanishing. Same pattern
  // W-CHARLIE-FIX GAP 2 applied to Charlie in-chat
  // (SellerEstimateBlock.tsx:278-326). Email-safe: <table>/<td> layout,
  // inline styles, no flexbox, no <div> background tricks Outlook
  // strips. POPULATED path (N>0) is BYTE-IDENTICAL to pre-fix — only
  // the outer gate changes shape.
  const taxComps = (sellerEstimate?.estimate?.taxMatch?.comparables || []) as any[]
  const taxMatchEst = sellerEstimate?.estimate?.taxMatch?.estimatedPrice
  const taxMatchRange = sellerEstimate?.estimate?.taxMatch?.priceRange
  const taxMatchEmptyStateHtml = `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; margin-bottom: 10px;">
        <tr><td style="padding: 12px 14px; font-size: 12px; color: #475569; line-height: 1.5;">
          No tax-matched comparables for this property &mdash; the matcher&rsquo;s &plusmn;20% same-municipality tax band did not surface enough comps to qualify a tier. The geo-based comparables above remain the primary value signal.
        </td></tr>
      </table>`
  // W-CHARLIE-FINETUNE-FIX (2026-06-14) — Tax-Match Confidence rail.
  // Defined BEFORE taxMatchHtml so the template can interpolate it
  // between the estimate pill and the tiles (same placement as the
  // estimator's HomeEstimatorResults.tsx:1035-1048). Gated on
  // view.present.taxTierRail; when off (legacy lead or no cascade)
  // it's empty-string and the surrounding tax section silently skips
  // the rail. Outlook-safe nested-table layout mirrors tierRailHtml
  // (geo rail) at L532 below.
  const taxTierRailHtml = view?.present.taxTierRail && view.taxTierRail ? `
    <div style="margin: 12px 0 14px;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">Tax-Match Confidence</div>
      ${TIER_ORDER.map(slot => {
        const tr = view.taxTierRail!.slots[slot]
        const meta = TIER_META[slot]
        const sub = sellerPath === 'home' ? meta.homeSub : meta.condoSub
        const isBest = view.taxTierRail!.bestGeoTier === slot
        const bg = isBest ? '#ecfdf5' : '#f8fafc'
        const border = isBest ? '#34d399' : '#e2e8f0'
        const rightCell = tr
          ? `<span style="font-size:14px;font-weight:700;color:#0f172a;">${tr.median != null ? '$' + Number(tr.median).toLocaleString('en-CA') : '&mdash;'}</span> <span style="font-size:11px;color:#64748b;margin-left:8px;">${tr.count ?? 0} comp${(tr.count ?? 0) === 1 ? '' : 's'}</span>`
          : `<span style="font-size:11px;color:#94a3b8;font-style:italic;">no data</span>`
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;"><tr><td style="padding: 10px 12px; background: ${bg}; border: 1px solid ${border}; border-radius: 8px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align: middle;">
            <span style="display:inline-block;background:${meta.color};color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;">${meta.marker} ${meta.label}</span>
            <span style="font-size:12px;color:#475569;margin-left:8px;">${sub}</span>
            ${isBest ? '<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#047857;background:#d1fae5;padding:2px 6px;border-radius:3px;margin-left:8px;">Anchor</span>' : ''}
          </td>
          <td style="text-align: right; vertical-align: middle; white-space: nowrap;">${rightCell}</td>
        </tr></table></td></tr></table>`
      }).join('')}
    </div>
  ` : ''

  const taxMatchHtml = `
    <div style="margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Tax-Matched (${taxComps.length})</div>
      <div style="font-size: 12px; color: #64748b; margin-bottom: 10px;">Same-municipality sales with similar property tax &mdash; a co-equal value signal alongside the comps above.</div>
      ${taxComps.length === 0 ? taxMatchEmptyStateHtml : `${taxMatchEst != null ? `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: baseline;">
        <span style="font-size: 11px; color: #64748b;">Tax-matched estimate</span>
        <span style="font-size: 13px; font-weight: 700; color: #0f172a;">$${Number(taxMatchEst).toLocaleString('en-CA')}${taxMatchRange ? `<span style="font-size:11px;font-weight:400;color:#94a3b8;margin-left:8px;"> &middot; $${Number(taxMatchRange.low).toLocaleString('en-CA')}&ndash;$${Number(taxMatchRange.high).toLocaleString('en-CA')}</span>` : ''}</span>
      </div>` : ''}
      ${taxTierRailHtml}
      ${taxComps.slice(0, 10).map((c: any) => {
        const price = c.closePrice || c.close_price || c.listPrice || c.list_price || 0
        const photo = c.mediaUrl || (c.media && c.media[0]?.media_url) || ''
        // W-CHARLIE-FINETUNE-FIX (2026-06-14): shared slug helper (see
        // sellerComps above).
        const slugRaw = c._slug || buildPropertySlug({
          listingKey: c.listingKey || c.listing_key,
          unparsedAddress: c.unparsedAddress || c.unparsed_address,
          propertySubtype: c.propertySubtype || c.property_subtype,
          unitNumber: c.unitNumber || c.unit_number,
        })
        const slug = slugRaw ? (slugRaw.startsWith('/') ? slugRaw : '/' + slugRaw) : ''
        // Per-tile sourceTier (multi-tier display list). Falls back to anchor
        // tier when the tile doesn't carry one (forward-compat).
        const tileTier = c.sourceTier || validGeoTier
        return `
          <a href="${baseUrl}${slug}" style="display: block; text-decoration: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              ${photo ? `<td width="80" style="vertical-align: top;"><img src="${photo}" width="80" height="72" style="display:block;width:80px;height:72px;"></td>` : ''}
              <td style="padding: 10px 14px; vertical-align: middle;">
                ${tierChipHtml(tileTier)}
                <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${(c.unparsedAddress || c.unparsed_address || '').split(',')[0]}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 3px;">${[c.bedrooms_total ? c.bedrooms_total + ' bed' : '', c.bathrooms_total_integer ? c.bathrooms_total_integer + ' bath' : '', c.sqft ? c.sqft + ' sqft' : '', c.daysOnMarket ? c.daysOnMarket + 'd DOM' : ''].filter(Boolean).join(' &middot; ')}</div>
              </td>
              <td style="padding: 10px 14px; text-align: right; vertical-align: middle;">
                <div style="font-size: 16px; font-weight: 800; color: #059669;">$${Number(price).toLocaleString('en-CA')}</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Sold &rarr;</div>
              </td>
            </tr></table>
          </a>
        `
      }).join('')}`}
    </div>
  `

  // W-CHARLIE-BUYER-CHUNK4 (2026-06-15): buyer Tax-Matched section —
  // RE-FRAMED to "recently sold homes matched by property-tax band"
  // (NOT the prior "what you'll pay yearly" assessment framing). The
  // server-derived buyerTaxMatch.samples are now SOLD comps fetched
  // via the shared tax-band SOLD query (lib/estimator/tax-band-sold-
  // query.ts — same query the seller matcher uses). Each tile shows
  // the comp's sold price + close_date + tax/yr.
  const buyerTaxMatchHtml = isBuyer && buyerTaxMatch ? (() => {
    const btm: any = buyerTaxMatch
    if (btm.isEmpty) {
      return `
        <div style="margin: 20px 0;">
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Tax-Matched (0)</div>
          <div style="font-size: 12px; color: #64748b; margin-bottom: 10px;">Recently sold homes matched by property-tax band &mdash; comparable value evidence.</div>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">
            <tr><td style="padding: 12px 14px; font-size: 12px; color: #475569; line-height: 1.5;">
              ${btm.reason || 'No SOLD comps matched the derived tax band.'}
            </td></tr>
          </table>
        </div>
      `
    }
    const bandStr = btm.taxBand
      ? '$' + Number(btm.taxBand.low).toLocaleString('en-CA', { maximumFractionDigits: 0 }) + ' &ndash; $' + Number(btm.taxBand.high).toLocaleString('en-CA', { maximumFractionDigits: 0 })
      : '&mdash;'
    return `
      <div style="margin: 20px 0;">
        <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Tax-Matched (${btm.samples.length})</div>
        <div style="font-size: 12px; color: #64748b; margin-bottom: 10px;">Recently sold homes matched by property-tax band &mdash; real transaction evidence anchored to the ${btm.withTaxCount} of ${btm.totalCount} matched listings carrying tax data.</div>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; margin-bottom: 10px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="font-size: 11px; color: #64748b;">Tax band (derived)</td>
            <td style="text-align: right; font-size: 13px; font-weight: 700; color: #0f172a;">${bandStr}<span style="font-size:11px;font-weight:400;color:#94a3b8;margin-left:8px;">/yr</span></td>
          </tr></table>
        </div>
        ${btm.samples.map((s: any) => {
          const photo = (s.media && s.media[0] && (s.media[0].media_url || s.media[0].url)) || ''
          const slugRaw = s._slug || buildPropertySlug({
            listingKey: s.listingKey,
            unparsedAddress: s.address,
            propertySubtype: s.propertySubtype,
            unitNumber: s.unitNumber,
          })
          const slug = slugRaw ? (slugRaw.startsWith('/') ? slugRaw : '/' + slugRaw) : ''
          const addrShort = (s.address || '').split(',')[0]
          return `
            <a href="${baseUrl}${slug}" style="display: block; text-decoration: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 8px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                ${photo ? `<td width="80" style="vertical-align: top;"><img src="${photo}" width="80" height="72" style="display:block;width:80px;height:72px;"></td>` : ''}
                <td style="padding: 10px 14px; vertical-align: middle;">
                  <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${addrShort}</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 3px;">${[s.bedrooms ? s.bedrooms + ' bed' : '', s.bathrooms ? s.bathrooms + ' bath' : '', s.propertySubtype].filter(Boolean).join(' &middot; ')}</div>
                  ${s.tax ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">$${Number(s.tax).toLocaleString('en-CA', { maximumFractionDigits: 0 })}/yr tax</div>` : ''}
                </td>
                <td style="padding: 10px 14px; text-align: right; vertical-align: middle; white-space: nowrap;">
                  <div style="font-size: 14px; font-weight: 800; color: #059669;">${s.price != null ? '$' + Number(s.price).toLocaleString('en-CA') : '&mdash;'}</div>
                  <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Sold</div>
                </td>
              </tr></table>
            </a>
          `
        }).join('')}
      </div>
    `
  })() : ''

  const competingHtml = sellerEstimate?.competingListings && sellerEstimate.competingListings.length > 0 ? `
    <div style="margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Competing For Sale (${sellerEstimate.competingListings.length})</div>
      ${sellerEstimate.competingListings.slice(0, 10).map((c: any) => {
        const price = c.list_price || 0
        const addr = (c.unparsed_address || '').split(',')[0]
        const photo = c.mediaUrl || (c.media && c.media[0]?.media_url) || ''
        // W-CHARLIE-FINETUNE-FIX (2026-06-14): shared slug helper. Same
        // as sellerComps + taxComps above.
        const slugRaw = c._slug || buildPropertySlug({
          listingKey: c.listingKey || c.listing_key,
          unparsedAddress: c.unparsedAddress || c.unparsed_address,
          propertySubtype: c.propertySubtype || c.property_subtype,
          unitNumber: c.unitNumber || c.unit_number,
        })
        const slug = slugRaw ? (slugRaw.startsWith('/') ? slugRaw : '/' + slugRaw) : ''
        return `
          <a href="${baseUrl}${slug}" style="display: block; text-decoration: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; margin-bottom: 8px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              ${photo ? `<td width="80" style="vertical-align: top;"><img src="${photo}" width="80" height="72" style="display:block;width:80px;height:72px;"></td>` : ''}
              <td style="padding: 10px 14px; vertical-align: middle;">
                <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${addr}</div>
                <div style="font-size: 12px; color: #64748b; margin-top: 3px;">${[c.bedrooms_total ? c.bedrooms_total + ' bed' : '', c.bathrooms_total_integer ? c.bathrooms_total_integer + ' bath' : ''].filter(Boolean).join(' &middot; ')}</div>
              </td>
              <td style="padding: 10px 14px; text-align: right; vertical-align: middle;">
                <div style="font-size: 16px; font-weight: 800; color: #1d4ed8;">$${Number(price).toLocaleString('en-CA')}</div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">For Sale &rarr;</div>
              </td>
            </tr></table>
          </a>
        `
      }).join('')}
    </div>
  ` : ''

  // W-CHARLIE-CONVERGENCE CV-2 (2026-06-14) — Property Estimate price card.
  // Inline-styled (email-safe) version of the dashboard's white-card price
  // section. Gated on view.present.priceCard so buyer plans / paths
  // without an estimate silent-skip.
  const priceCardHtml = view?.present.priceCard ? `
    <div style="margin: 20px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px;">
      <div style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.1em;">Estimated Value</div>
      <div style="font-size: 28px; font-weight: 900; color: #0f172a; margin-top: 6px;">${view.priceCard.estimatedPrice != null ? '$' + Number(view.priceCard.estimatedPrice).toLocaleString('en-CA') : '&mdash;'}</div>
      ${view.priceCard.priceRange ? `<div style="font-size: 12px; color: #64748b; margin-top: 4px;">Range $${Number(view.priceCard.priceRange.low).toLocaleString('en-CA')} &ndash; $${Number(view.priceCard.priceRange.high).toLocaleString('en-CA')}</div>` : ''}
      ${(view.priceCard.confidence || view.priceCard.matchTier) ? `<div style="font-size: 12px; color: #475569; margin-top: 6px;">Confidence: ${view.priceCard.confidence || '&mdash;'}${view.priceCard.matchTier ? ' &middot; ' + view.priceCard.matchTier : ''}</div>` : ''}
    </div>
  ` : ''

  // W-CHARLIE-CONVERGENCE CV-2 — 4-row tier rail with anchor highlight.
  // One nested <table> per row keeps the layout email-client-safe (Outlook
  // Desktop renders nested tables reliably; CSS grid would not). Tier
  // metadata (color, label, marker, per-path sub) comes from CV-0
  // TIER_META — no inline duplication of hex/labels in this file anymore.
  const tierRailHtml = view?.present.tierRail ? `
    <div style="margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">Confidence by Area</div>
      ${TIER_ORDER.map(slot => {
        const tr = view.tierRail.slots[slot]
        const meta = TIER_META[slot]
        const sub = sellerPath === 'home' ? meta.homeSub : meta.condoSub
        const isBest = view.tierRail.bestGeoTier === slot
        const bg = isBest ? '#ecfdf5' : '#f8fafc'
        const border = isBest ? '#34d399' : '#e2e8f0'
        const rightCell = tr
          ? `<span style="font-size:14px;font-weight:700;color:#0f172a;">${tr.median != null ? '$' + Number(tr.median).toLocaleString('en-CA') : '&mdash;'}</span> <span style="font-size:11px;color:#64748b;margin-left:8px;">${tr.count ?? 0} comp${(tr.count ?? 0) === 1 ? '' : 's'}</span>`
          : `<span style="font-size:11px;color:#94a3b8;font-style:italic;">no data</span>`
        return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;"><tr><td style="padding: 10px 12px; background: ${bg}; border: 1px solid ${border}; border-radius: 8px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="vertical-align: middle;">
            <span style="display:inline-block;background:${meta.color};color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;">${meta.marker} ${meta.label}</span>
            <span style="font-size:12px;color:#475569;margin-left:8px;">${sub}</span>
            ${isBest ? '<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#047857;background:#d1fae5;padding:2px 6px;border-radius:3px;margin-left:8px;">Anchor</span>' : ''}
          </td>
          <td style="text-align: right; vertical-align: middle; white-space: nowrap;">${rightCell}</td>
        </tr></table></td></tr></table>`
      }).join('')}
      <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;">Narrow spread = high confidence. Wide spread = subject&apos;s block sold differently than the community.</div>
    </div>
  ` : ''

  const vipHtml = vipCreditUsed ? `
    <div style="background: linear-gradient(135deg, #1e1b4b, #312e81); border: 1px solid rgba(99,102,241,0.3); border-radius: 10px; padding: 14px 18px; margin: 16px 0; display: flex; align-items: center; justify-content: space-between;">
      <div>
        <div style="font-size: 12px; font-weight: 700; color: #a5b4fc;">&#10022; VIP Access Credit Used</div>
        <div style="font-size: 11px; color: rgba(165,180,252,0.6); margin-top: 3px;">${vipCreditPlansUsed} of ${vipCreditTotal} plans used</div>
      </div>
      <div style="font-size: 11px; color: rgba(165,180,252,0.5);">Request more from your agent</div>
    </div>
  ` : ''

  const disclaimerHtml = `
    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px; margin: 16px 0;">
      <p style="margin: 0; font-size: 11px; color: #92400e; line-height: 1.6;">
        <strong style="color: #d97706;">&#9888; AI Disclaimer:</strong> This plan is generated by artificial intelligence using market data and algorithms. It is intended for informational purposes only and does not constitute professional real estate, legal, or financial advice. All information should be independently verified with a licensed real estate agent before making any decisions.
      </p>
    </div>
  `

  const agentHtml = agent ? `
    <div style="background: #0f172a; border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;">
      <div style="font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 10px;">Your Agent</div>
      ${agent.profile_photo_url ? `<img src="${agent.profile_photo_url}" alt="${agent.full_name}" style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.15); margin-bottom: 8px;">` : ''}
      <div style="font-size: 15px; font-weight: 700; color: #fff;">${agent.full_name}</div>
      ${agent.title ? `<div style="font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px;">${agent.title}</div>` : ''}
      ${agent.brokerage_name ? `<div style="font-size: 11px; color: rgba(255,255,255,0.3); margin-top: 2px;">${agent.brokerage_name}</div>` : ''}
      <div style="margin-top: 12px;">
        ${agent.email ? `<a href="mailto:${agent.email}" style="display: inline-block; margin: 4px; padding: 7px 16px; background: rgba(255,255,255,0.08); border-radius: 8px; color: #93c5fd; font-size: 12px; text-decoration: none;">${agent.email}</a>` : ''}
        ${agent.cell_phone ? `<a href="tel:${agent.cell_phone}" style="display: inline-block; margin: 4px; padding: 7px 16px; background: rgba(255,255,255,0.08); border-radius: 8px; color: #93c5fd; font-size: 12px; text-decoration: none;">${agent.cell_phone}</a>` : ''}
      </div>
    </div>
  ` : ''

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
      <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 28px; border-radius: 12px 12px 0 0;">
        <div style="font-size: 26px; font-weight: 900; color: #fff; margin-bottom: 16px;">
          <span style="font-weight: 900;">${brandName}</span>
        </div>
        <h1 style="color: #fff; font-size: 22px; font-weight: 800; margin: 0 0 8px;">
          ${isBuyer ? '&#127968; Buyer Plan' : '&#128176; Seller Strategy'} &mdash; ${geoName || 'GTA'}
        </h1>
        <p style="color: rgba(255,255,255,0.5); margin: 0; font-size: 14px;">
          Prepared for ${userName} &middot; ${new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
      <div style="padding: 24px 28px; border: 1px solid #e2e8f0; border-top: none;">
        ${conditionHtml}
        ${marketHtml}
        ${offerIntelHtml}
        ${bestTimeHtml}
        ${summaryHtml}
        ${blocksHtml}
        ${planCardHtml}
        ${profileHtml}
        ${priceCardHtml}
        ${tierRailHtml}
        ${listingsHtml}
        ${comparableSoldHtml}
        ${isBuyer ? buyerTaxMatchHtml : taxMatchHtml}
        ${competingHtml}
        ${vipHtml}
        ${disclaimerHtml}
        ${agentHtml}
        <div style="text-align: center; margin: 24px 0 8px;">
          <a href="${baseUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px;">
            &#10022; Open ${brandName}
          </a>
        </div>
      </div>
      <div style="padding: 16px 28px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 11px;">${brandName} &middot; ${domain}</p>
        ${sourceUrl ? `<p style="margin: 4px 0 0; color: #cbd5e1; font-size: 10px;">Source: <a href="${sourceUrl}" style="color: #94a3b8; text-decoration: underline;">${sourceUrl}</a></p>` : ''}
      </div>
    </div>
  `
}
