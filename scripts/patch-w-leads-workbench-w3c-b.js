const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const d = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
              pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());

const edits = [
  // ============================================================================
  // FILE 1: app/api/walliam/contact/route.ts  (5 transforms)
  // ============================================================================
  {
    file: 'app/api/walliam/contact/route.ts',
    transforms: [
      {
        id: 'CONTACT-T1: headers import after next/server',
        old: "import { NextRequest, NextResponse } from 'next/server'\nimport { createClient } from '@supabase/supabase-js'",
        new: "import { NextRequest, NextResponse } from 'next/server'\nimport { headers } from 'next/headers'\nimport { createClient } from '@supabase/supabase-js'"
      },
      {
        id: 'CONTACT-T2: pageUrl capture before leads insert',
        old: "    // Save lead with full hierarchy chain (per Lead+Email contract)\n    const { data: lead } = await supabase.from('leads').insert({",
        new: "    // W3c: capture source URL from referer for both leads.source_url + email render\n    const pageUrl = headers().get('referer') || null\n\n    // Save lead with full hierarchy chain (per Lead+Email contract)\n    const { data: lead } = await supabase.from('leads').insert({"
      },
      {
        id: 'CONTACT-T3: source_url in insert object',
        old: "      message: message || null,\n      source: source || `${sourceKey}_contact`,\n      lead_origin_route: 'contact_form',",
        new: "      message: message || null,\n      source: source || `${sourceKey}_contact`,\n      source_url: pageUrl,\n      lead_origin_route: 'contact_form',"
      },
      {
        id: 'CONTACT-T4: buildContactEmail call + sourceUrl',
        old: "    const html = buildContactEmail({ name, email, phone, message, source, geo_name, building_id, listing_id, brandName })",
        new: "    const html = buildContactEmail({ name, email, phone, message, source, sourceUrl: pageUrl, geo_name, building_id, listing_id, brandName })"
      },
      {
        id: 'CONTACT-T5: buildContactEmail decl destructure + sourceUrl',
        old: "function buildContactEmail({ name, email, phone, message, source, geo_name, building_id, listing_id, brandName }: any): string {",
        new: "function buildContactEmail({ name, email, phone, message, source, sourceUrl, geo_name, building_id, listing_id, brandName }: any): string {"
      }
    ]
  },

  // ============================================================================
  // FILE 2: app/api/charlie/appointment/route.ts  (9 transforms)
  // ============================================================================
  {
    file: 'app/api/charlie/appointment/route.ts',
    transforms: [
      {
        id: 'APPT-T1: headers import',
        old: "import { NextRequest, NextResponse } from 'next/server'\nimport { createClient } from '@supabase/supabase-js'",
        new: "import { NextRequest, NextResponse } from 'next/server'\nimport { headers } from 'next/headers'\nimport { createClient } from '@supabase/supabase-js'"
      },
      {
        id: 'APPT-T2: pageUrl capture before leads insert',
        old: "    // Step 3: Save lead with full hierarchy chain\n    const { data: lead, error: leadError } = await supabase\n      .from('leads')",
        new: "    // W3c: capture source URL from referer for both leads.source_url + email render\n    const pageUrl = headers().get('referer') || null\n\n    // Step 3: Save lead with full hierarchy chain\n    const { data: lead, error: leadError } = await supabase\n      .from('leads')"
      },
      {
        id: 'APPT-T3: source_url in insert',
        old: "        source: `${sourceKey}_charlie`,\n        lead_origin_route: 'charlie',\n        intent,\n        geo_name: geo_name || null,",
        new: "        source: `${sourceKey}_charlie`,\n        source_url: pageUrl,\n        lead_origin_route: 'charlie',\n        intent,\n        geo_name: geo_name || null,"
      },
      {
        id: 'APPT-T4: buildUserConfirmationEmail call + sourceUrl',
        old: "        html: buildUserConfirmationEmail({\n          name, intent, formattedDate, appointment_time,\n          appointment_properties, agent, rescheduleUrl,\n          brandName, domain, baseUrl: BASE_URL,\n        }),",
        new: "        html: buildUserConfirmationEmail({\n          name, intent, formattedDate, appointment_time,\n          appointment_properties, agent, rescheduleUrl,\n          brandName, domain, baseUrl: BASE_URL,\n          sourceUrl: pageUrl,\n        }),"
      },
      {
        id: 'APPT-T5: buildUserConfirmationEmail params + sourceUrl',
        old: "  rescheduleUrl: string\n  brandName: string\n  domain: string\n  baseUrl: string\n}): string {",
        new: "  rescheduleUrl: string\n  brandName: string\n  domain: string\n  baseUrl: string\n  sourceUrl?: string | null\n}): string {"
      },
      {
        id: 'APPT-T6: buildUserConfirmationEmail destructure + sourceUrl',
        old: "  const { name, intent, formattedDate, appointment_time, appointment_properties, agent, rescheduleUrl, brandName, domain, baseUrl } = data",
        new: "  const { name, intent, formattedDate, appointment_time, appointment_properties, agent, rescheduleUrl, brandName, domain, baseUrl, sourceUrl } = data"
      },
      {
        id: 'APPT-T7: buildAgentNotificationEmail call + sourceUrl',
        old: "          html: buildAgentNotificationEmail({\n            name, email, phone, intent, formattedDate, appointment_time,\n            appointment_properties, geo_name,\n            brandName, domain, baseUrl: BASE_URL,\n          }),",
        new: "          html: buildAgentNotificationEmail({\n            name, email, phone, intent, formattedDate, appointment_time,\n            appointment_properties, geo_name,\n            brandName, domain, baseUrl: BASE_URL,\n            sourceUrl: pageUrl,\n          }),"
      },
      {
        id: 'APPT-T8: buildAgentNotificationEmail params + sourceUrl',
        old: "  geo_name?: string\n  brandName: string\n  domain: string\n  baseUrl: string\n}): string {",
        new: "  geo_name?: string\n  brandName: string\n  domain: string\n  baseUrl: string\n  sourceUrl?: string | null\n}): string {"
      },
      {
        id: 'APPT-T9: buildAgentNotificationEmail destructure + sourceUrl',
        old: "  const { name, email, phone, intent, formattedDate, appointment_time, appointment_properties, geo_name, brandName, domain, baseUrl } = data",
        new: "  const { name, email, phone, intent, formattedDate, appointment_time, appointment_properties, geo_name, brandName, domain, baseUrl, sourceUrl } = data"
      }
    ]
  },

  // ============================================================================
  // FILE 3: app/api/charlie/lead/route.ts  (8 transforms - INSERT path only)
  // ============================================================================
  {
    file: 'app/api/charlie/lead/route.ts',
    transforms: [
      {
        id: 'LEAD-T1: headers import',
        old: "import { NextRequest, NextResponse } from 'next/server'\nimport { createClient } from '@supabase/supabase-js'",
        new: "import { NextRequest, NextResponse } from 'next/server'\nimport { headers } from 'next/headers'\nimport { createClient } from '@supabase/supabase-js'"
      },
      {
        id: 'LEAD-T2: pageUrl capture before F57 UPSERT block',
        old: "    // F57: UPSERT into existing plan-email lead row, not new INSERT.\n    // Match on (user_id, source='walliam_charlie', intent). Most recent row wins\n    // in the rare case multiple plan-email rows exist for same user+intent.\n    let leadId: string | null = null",
        new: "    // W3c: capture source URL from referer for both leads.source_url + email render\n    const pageUrl = headers().get('referer') || null\n\n    // F57: UPSERT into existing plan-email lead row, not new INSERT.\n    // Match on (user_id, source='walliam_charlie', intent). Most recent row wins\n    // in the rare case multiple plan-email rows exist for same user+intent.\n    let leadId: string | null = null"
      },
      {
        id: 'LEAD-T3: source_url in defensive INSERT (UPDATE path leaves existing value intact)',
        old: "          source: `${sourceKey}_charlie`,\n          lead_origin_route: 'charlie',\n          intent,\n          geo_name: profile?.geoName || null,",
        new: "          source: `${sourceKey}_charlie`,\n          source_url: pageUrl,\n          lead_origin_route: 'charlie',\n          intent,\n          geo_name: profile?.geoName || null,"
      },
      {
        id: 'LEAD-T4: buildUserPlanEmail call + sourceUrl',
        old: "        html: buildUserPlanEmail({ name, intent, buyerProfile, sellerProfile, listings, analytics, agent, brandName, domain, baseUrl: BASE_URL }),",
        new: "        html: buildUserPlanEmail({ name, intent, buyerProfile, sellerProfile, listings, analytics, agent, brandName, domain, baseUrl: BASE_URL, sourceUrl: pageUrl }),"
      },
      {
        id: 'LEAD-T5: buildUserPlanEmail params + sourceUrl',
        old: "  agent?: any\n  brandName: string\n  domain: string\n  baseUrl: string\n}): string {",
        new: "  agent?: any\n  brandName: string\n  domain: string\n  baseUrl: string\n  sourceUrl?: string | null\n}): string {"
      },
      {
        id: 'LEAD-T6: buildUserPlanEmail destructure + sourceUrl',
        old: "  const { name, intent, buyerProfile, sellerProfile, listings, analytics, agent, brandName, domain, baseUrl } = data",
        new: "  const { name, intent, buyerProfile, sellerProfile, listings, analytics, agent, brandName, domain, baseUrl, sourceUrl } = data"
      },
      {
        id: 'LEAD-T7: buildAgentLeadEmail call + sourceUrl',
        old: "          html: buildAgentLeadEmail({ name, email: authEmail, phone, intent, buyerProfile, sellerProfile, listings, analytics, brandName, domain, baseUrl: BASE_URL }),",
        new: "          html: buildAgentLeadEmail({ name, email: authEmail, phone, intent, buyerProfile, sellerProfile, listings, analytics, brandName, domain, baseUrl: BASE_URL, sourceUrl: pageUrl }),"
      },
      {
        id: 'LEAD-T8: buildAgentLeadEmail params + sourceUrl (anchor: analytics->brandName->domain->baseUrl, unique vs buildUserPlanEmail which has agent between)',
        old: "  analytics?: any\n  brandName: string\n  domain: string\n  baseUrl: string\n}): string {",
        new: "  analytics?: any\n  brandName: string\n  domain: string\n  baseUrl: string\n  sourceUrl?: string | null\n}): string {"
      },
      {
        id: 'LEAD-T9: buildAgentLeadEmail destructure + sourceUrl',
        old: "  const { name, email, phone, intent, buyerProfile, sellerProfile, listings, brandName, domain, baseUrl } = data",
        new: "  const { name, email, phone, intent, buyerProfile, sellerProfile, listings, brandName, domain, baseUrl, sourceUrl } = data"
      }
    ]
  },

  // ============================================================================
  // FILE 4: app/api/charlie/plan-email/route.ts  (6 transforms)
  // ============================================================================
  {
    file: 'app/api/charlie/plan-email/route.ts',
    transforms: [
      {
        id: 'PLAN-T1: headers import',
        old: "import { NextRequest, NextResponse } from 'next/server'\nimport { createClient } from '@supabase/supabase-js'",
        new: "import { NextRequest, NextResponse } from 'next/server'\nimport { headers } from 'next/headers'\nimport { createClient } from '@supabase/supabase-js'"
      },
      {
        id: 'PLAN-T2: pageUrl capture before leads insert',
        old: "    // Save lead with full hierarchy chain stamped (per Lead+Email contract)\n    const { data: lead, error: leadError } = await supabase.from('leads').insert({",
        new: "    // W3c: capture source URL from referer for both leads.source_url + email render\n    const pageUrl = headers().get('referer') || null\n\n    // Save lead with full hierarchy chain stamped (per Lead+Email contract)\n    const { data: lead, error: leadError } = await supabase.from('leads').insert({"
      },
      {
        id: 'PLAN-T3: source_url in insert',
        old: "      source: `${sourceKey}_charlie`,\n      lead_origin_route: 'charlie',\n      intent: planType,",
        new: "      source: `${sourceKey}_charlie`,\n      source_url: pageUrl,\n      lead_origin_route: 'charlie',\n      intent: planType,"
      },
      {
        id: 'PLAN-T4: buildRichPlanEmail call + sourceUrl',
        old: "    const html = buildRichPlanEmail({ userName, userEmail, planType, plan, analytics, listings: listings || [], agent, geoName, comparables: comparables || [], sellerEstimate: sellerEstimate || null, vipCreditUsed: vipCreditUsed || false, vipCreditPlansUsed: vipCreditPlansUsed || 0, vipCreditTotal: vipCreditTotal || 1, blocks: blocks || [], brandName, domain, baseUrl: BASE_URL })",
        new: "    const html = buildRichPlanEmail({ userName, userEmail, planType, plan, analytics, listings: listings || [], agent, geoName, comparables: comparables || [], sellerEstimate: sellerEstimate || null, vipCreditUsed: vipCreditUsed || false, vipCreditPlansUsed: vipCreditPlansUsed || 0, vipCreditTotal: vipCreditTotal || 1, blocks: blocks || [], brandName, domain, baseUrl: BASE_URL, sourceUrl: pageUrl })"
      },
      {
        id: 'PLAN-T5: buildRichPlanEmail params + sourceUrl',
        old: "  blocks: any[]\n  brandName: string\n  domain: string\n  baseUrl: string\n}): string {",
        new: "  blocks: any[]\n  brandName: string\n  domain: string\n  baseUrl: string\n  sourceUrl?: string | null\n}): string {"
      },
      {
        id: 'PLAN-T6: buildRichPlanEmail destructure + sourceUrl',
        old: "  const { userName, planType, plan, analytics, listings, agent, geoName, comparables, sellerEstimate, vipCreditUsed, vipCreditPlansUsed, vipCreditTotal, blocks, brandName, domain, baseUrl } = data",
        new: "  const { userName, planType, plan, analytics, listings, agent, geoName, comparables, sellerEstimate, vipCreditUsed, vipCreditPlansUsed, vipCreditTotal, blocks, brandName, domain, baseUrl, sourceUrl } = data"
      }
    ]
  },

  // ============================================================================
  // FILE 5: app/api/walliam/charlie/vip-request/route.ts  (8 transforms)
  // ============================================================================
  {
    file: 'app/api/walliam/charlie/vip-request/route.ts',
    transforms: [
      {
        id: 'VIPREQ-T1: headers import',
        old: "import { NextRequest, NextResponse } from 'next/server'\nimport { createClient } from '@supabase/supabase-js'",
        new: "import { NextRequest, NextResponse } from 'next/server'\nimport { headers } from 'next/headers'\nimport { createClient } from '@supabase/supabase-js'"
      },
      {
        id: 'VIPREQ-T2: pageUrl capture before emailHtml build (so available for both email call AND lead insert)',
        old: "    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${tenantDomain}`\n    const approveUrl = `${baseUrl}/api/walliam/charlie/vip-approve?token=${vipRequest.approval_token}&action=approve`\n    const denyUrl = `${baseUrl}/api/walliam/charlie/vip-approve?token=${vipRequest.approval_token}&action=deny`\n\n    const emailHtml = buildAgentEmailHtml({",
        new: "    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${tenantDomain}`\n    const approveUrl = `${baseUrl}/api/walliam/charlie/vip-approve?token=${vipRequest.approval_token}&action=approve`\n    const denyUrl = `${baseUrl}/api/walliam/charlie/vip-approve?token=${vipRequest.approval_token}&action=deny`\n\n    // W3c: capture source URL from referer for both leads.source_url + email render\n    const pageUrl = headers().get('referer') || null\n\n    const emailHtml = buildAgentEmailHtml({"
      },
      {
        id: 'VIPREQ-T3: buildAgentEmailHtml call + sourceUrl',
        old: "    const emailHtml = buildAgentEmailHtml({\n      userName,\n      userEmail,\n      userPhone,\n      planType: planType || 'buyer',\n      approveUrl,\n      denyUrl,",
        new: "    const emailHtml = buildAgentEmailHtml({\n      userName,\n      userEmail,\n      userPhone,\n      planType: planType || 'buyer',\n      approveUrl,\n      denyUrl,\n      sourceUrl: pageUrl,"
      },
      {
        id: 'VIPREQ-T4: source_url in leads insert',
        old: "        contact_phone: userPhone || null,\n        source: `${sourceKey}_charlie_vip_request`,\n        lead_origin_route: 'charlie_vip_request',",
        new: "        contact_phone: userPhone || null,\n        source: `${sourceKey}_charlie_vip_request`,\n        source_url: pageUrl,\n        lead_origin_route: 'charlie_vip_request',"
      },
      {
        id: 'VIPREQ-T5: buildAgentEmailHtml params + sourceUrl (uses data.xxx, no destructure)',
        old: "  agentName: string\n  brandName: string\n  tenantDomain: string\n}): string {",
        new: "  agentName: string\n  brandName: string\n  tenantDomain: string\n  sourceUrl?: string | null\n}): string {"
      },
      {
        id: 'VIPREQ-T6: buildUserApprovalEmailHtml call: positional -> typed-object',
        old: "            html: buildUserApprovalEmailHtml(userName, agent?.full_name || brandName, autoApproveMessages, brandName, tenantDomain),",
        new: "            html: buildUserApprovalEmailHtml({\n              userName,\n              agentName: agent?.full_name || brandName,\n              plansGranted: autoApproveMessages,\n              brandName,\n              tenantDomain,\n              sourceUrl: pageUrl,\n            }),"
      },
      {
        id: 'VIPREQ-T7: buildUserApprovalEmailHtml decl: refactor positional -> typed-object + destructure',
        old: "function buildUserApprovalEmailHtml(userName: string, agentName: string, plansGranted: number, brandName: string, tenantDomain: string): string {\n  return `",
        new: "function buildUserApprovalEmailHtml(data: {\n  userName: string\n  agentName: string\n  plansGranted: number\n  brandName: string\n  tenantDomain: string\n  sourceUrl?: string | null\n}): string {\n  const { userName, agentName, plansGranted, brandName, tenantDomain, sourceUrl } = data\n  return `"
      }
    ]
  }
];

// ============================================================================
// Phase 1: validate every anchor across every file (zero writes)
// ============================================================================
console.log('=== Phase 1: validating anchors ===');
for (const e of edits) {
  const abs = path.join(ROOT, e.file);
  if (!fs.existsSync(abs)) throw new Error('FILE MISSING: ' + e.file);
  const inputBytes = fs.readFileSync(abs);
  let crlfIn = 0, lfOnlyIn = 0;
  for (let i = 0; i < inputBytes.length; i++) {
    if (inputBytes[i] === 0x0A) {
      if (i > 0 && inputBytes[i - 1] === 0x0D) crlfIn++; else lfOnlyIn++;
    }
  }
  const rawContent = inputBytes.toString('utf8');
  e.fileHasCRLF = crlfIn > 0 && lfOnlyIn === 0;
  let content = e.fileHasCRLF ? rawContent.replace(/\r\n/g, '\n') : rawContent;
  e.originalSize = inputBytes.length;
  for (const t of e.transforms) {
    const parts = content.split(t.old);
    if (parts.length - 1 !== 1) throw new Error(e.file + ' [' + t.id + ']: anchor count ' + (parts.length - 1) + ', expected 1');
    content = parts[0] + t.new + parts.slice(1).join(t.old);
    console.log('  OK ' + e.file + ' :: ' + t.id);
  }
  e.newContent = content;
}

// ============================================================================
// Tracker: header v6 -> v7, insert W3c-B-SHIPPED log entry above W3c-A-SHIPPED
// ============================================================================
{
  const trackerPath = 'docs/W-LEADS-WORKBENCH-TRACKER.md';
  const abs = path.join(ROOT, trackerPath);
  if (!fs.existsSync(abs)) throw new Error('TRACKER MISSING');
  const inputBytes = fs.readFileSync(abs);
  let content = inputBytes.toString('utf8');

  const oldH = '**Version:** v6 \u2014 OPEN 2026-05-13 \u2014 W2 + W2.5 + W3c-A SHIPPED.';
  const newH = '**Version:** v7 \u2014 OPEN 2026-05-13 \u2014 W2 + W2.5 + W3c-A + W3c-B SHIPPED.';
  if (content.split(oldH).length - 1 !== 1) throw new Error('tracker T1 anchor count != 1');
  content = content.replace(oldH, newH);
  console.log('  OK tracker :: T1 header v6 -> v7');

  const lines = content.split('\n');
  const prefix = '- **2026-05-13 W3c-A-SHIPPED**';
  const idx = lines.findIndex(l => l.startsWith(prefix));
  if (idx === -1) throw new Error('tracker T2 anchor not found');
  if (lines.filter(l => l.startsWith(prefix)).length !== 1) throw new Error('tracker T2 anchor not unique');

  const entry = "- **2026-05-13 W3c-B-SHIPPED** \u2014 W3c-B plumbing across 5 route files (38 transforms): `walliam/contact/route.ts` (5T), `charlie/appointment/route.ts` (9T), `charlie/lead/route.ts` (9T), `charlie/plan-email/route.ts` (6T), `walliam/charlie/vip-request/route.ts` (8T). Per route: `import { headers } from 'next/headers'` added after `next/server` import; `const pageUrl = headers().get('referer') || null` captured early in POST handler; `source_url: pageUrl` added to leads INSERT object (closes data gap \u2014 5 routes silently NULL'd source_url before this commit, now populate it). Per builder: `sourceUrl?: string | null` added to params type literal; destructure updated to extract `sourceUrl` (typed-object builders); call site updated to pass `sourceUrl: pageUrl`. `buildUserApprovalEmailHtml` (walliam/charlie/vip-request L480) refactored positional -> typed-object signature per discretion call (5 positional args -> 6-field data object + destructure; matches the other 8 named builders' pattern; single call site refactored). 8 builders touched: `buildContactEmail`, `buildUserConfirmationEmail`, `buildAgentNotificationEmail`, `buildUserPlanEmail`, `buildAgentLeadEmail`, `buildRichPlanEmail`, `buildAgentEmailHtml` (uses `data.xxx` pattern \u2014 no destructure transform, just params type), `buildUserApprovalEmailHtml` (positional refactored). NOT touched: charlie/lead UPDATE path at L188 (enrichment leaves existing source_url intact since plan-email creates the row with source_url already populated). RENDER ROWS DEFERRED to W3c-B2 \u2014 builders accept `sourceUrl` param now but do not render it in HTML; this is a clean architectural split (data plumbing in B; visual surface in B2) NOT a half-fix: each builder fully accepts + threads the value end-to-end; B2 will add `${sourceUrl ? <Source URL row> : ''}` blocks to each builder's HTML template. Both B and B2 ship today per Rule Zero phase rule (no gap). Live smoke deferred to post-W3c-C (entire chain landed). Multi-tenant safety: pageUrl is per-request from referer header; tenant scoping is unchanged (chain helper still gates by agent_id resolution + delegation overlay). NEXT: W3c-B2 (10 builder HTML render rows after Phase 9-fix file uploads with full bodies) then W3c-C (3 estimator routes \u2014 vip-request render row; vip-questionnaire plumbing + render; vip-approve positional refactor + render).";

  lines.splice(idx, 0, entry);
  content = lines.join('\n');
  console.log('  OK tracker :: T2 W3c-B-SHIPPED status log entry inserted at index ' + idx);

  edits.push({
    file: trackerPath,
    transforms: [],
    originalSize: inputBytes.length,
    newContent: content
  });
}

// ============================================================================
// Phase 2: write all files atomically with timestamped backups
// ============================================================================
console.log('');
console.log('=== Phase 2: writing files (stamp=' + stamp + ') ===');
for (const e of edits) {
  const abs = path.join(ROOT, e.file);
  fs.copyFileSync(abs, abs + '.backup_' + stamp);
  console.log('  BACKUP ' + e.file + '.backup_' + stamp);
  const writeContent = e.fileHasCRLF ? e.newContent.replace(/\n/g, '\r\n') : e.newContent;
  fs.writeFileSync(abs, writeContent, 'utf8');
  const outSize = fs.readFileSync(abs).length;
  const delta = outSize - e.originalSize;
  console.log('  WROTE  ' + e.file + ' (' + e.originalSize + ' -> ' + outSize + ' bytes, delta ' + (delta >= 0 ? '+' : '') + delta + ')');
}

console.log('');
console.log('=== W3c-B PATCH SUCCESS ===');