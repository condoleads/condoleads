const fs = require('fs')
const path = require('path')

const TRACKER = 'docs/W-LEADS-WORKBENCH-TRACKER.md'
const filePath = path.join(process.cwd(), TRACKER)
const ts = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)

fs.copyFileSync(filePath, filePath + '.backup_' + ts)
console.log('  BACKUP ' + path.basename(filePath) + ' -> ' + path.basename(filePath) + '.backup_' + ts)

let txt = fs.readFileSync(filePath, 'utf8')

function exactReplace(text, oldStr, newStr, label) {
  const idx = text.indexOf(oldStr)
  if (idx === -1) throw new Error('anchor not found: ' + label)
  if (text.indexOf(oldStr, idx + oldStr.length) !== -1) throw new Error('anchor not unique: ' + label)
  return text.replace(oldStr, newStr)
}

// 1. Version v14 -> v15
const oldVersion = '**Version:** v14 \u2014 W4c SHIPPED \u2014 Credits & Usage tab with UserCreditPanel extracted from Users page surface (3-pool model: chat / plans / estimator); 5-source server-side fetch keyed on anchorLead.user_id; empty state for anonymous leads'
const newVersion = '**Version:** v15 \u2014 W4d SHIPPED \u2014 Activity tab with cumulative visitor + admin timeline across leadFamily; user_activities by contact_email + lead_admin_actions by lead_id, both tenant_id-scoped; 13 activity types mapped to icon+label dictionary; filter pills + date-bucket grouping + 50-event cap with "Show all" expansion'
txt = exactReplace(txt, oldVersion, newVersion, 'version line v14 -> v15')

// 2. W4d row OPEN -> SHIPPED
const oldW4d = '| W4d | Activity tab (unified visitor + admin timeline, cumulative) | OPEN | \u2014 | Joins `user_activities` + `lead_admin_actions` across all user\'s leads |'
const newW4d = '| W4d | Activity tab (unified visitor + admin timeline, cumulative) | SHIPPED | 2026-05-14 | `components/admin-homes/lead-workbench/ActivityTab.tsx` new file (9807 bytes); server-side parallel fetch in page.tsx (`user_activities` by family contact_emails + `lead_admin_actions` by family lead_ids, both tenant_id-scoped, 500-row cap per source); 13 activity types mapped (`viewed_transaction_history` dominates at 67% of 1613 walliam rows); filter pills (All/Visitor/Admin), date-bucket grouping (Today/Yesterday/This week/older months), 50-event cap with Show-all expansion; `lead_admin_actions` empty as expected (W6a will populate -- timeline degrades gracefully to visitor-only) |'
txt = exactReplace(txt, oldW4d, newW4d, 'W4d row')

// 3. Append status log entry
const entry =
  '\n- **2026-05-14 W4d-SHIPPED** \u2014 Activity tab shipped. ' +
  '`components/admin-homes/lead-workbench/ActivityTab.tsx` new file (9807 bytes, ~270 LOC). ' +
  'Cumulative visitor + admin timeline across leadFamily. Visitor activities (`user_activities`) keyed by contact_email + tenant_id; admin actions (`lead_admin_actions`) keyed by lead_id + tenant_id; both server-side fetched in parallel via `Promise.all` in `page.tsx`, merged and sorted desc by created_at. 500-row cap per source. ' +
  'ActivityFeedItem discriminated union (kind: `\'visitor\'` | `\'admin\'`) carries fields from both source tables. ACTIVITY_META dictionary maps 13 verified activity_type values (B3 SQL probe) to icon+label pairs: `viewed_transaction_history` (1080 rows, 67%), `contact_form` (199), `registration` (150), `sale_offer_inquiry` (53), `estimator_used` (27), `property_inquiry` (25), `lease_offer_inquiry` (21), `sale_evaluation_request` (19), `estimator_contact_submitted` (16), `building_visit_request` (14), `estimator` (5), `unit_history_inquiry` (3), `plan_generated` (1). Unknown activity_type falls back to bullet icon + raw type string. ' +
  'UI: filter pills (All / Visitor / Admin with live counts), date-bucket grouping (Today / Yesterday / This week / `<Month YYYY>` for older), 50-event cap with "Show all N events" button. VisitorRow renders icon + label + activity_data summary (buildingName + unitNumber + buildingAddress + totalSales + geoName extracted) + contact_email + page_url click-through. AdminRow renders actor_role + action_type + target_field + lead context (when family > 1 and action targets sibling lead) + notes + before/after JSON. ' +
  '2 patches to existing files: ' +
  '(1) `app/admin-homes/leads/[id]/page.tsx` -- activity fetch block inserted between W4c user-credit fetch and return statement; parallel Promise.all of two conditional queries (familyEmails.length > 0 -> user_activities; familyIds.length > 0 -> lead_admin_actions) with empty-data Promise.resolve fallback for the no-data branch; merged + sorted server-side; passed as `activityFeed` prop. ' +
  '(2) `app/admin-homes/leads/[id]/LeadWorkbenchClient.tsx` 4 transforms -- import ActivityTab + ActivityFeedItem type; extend Props with `activityFeed: ActivityFeedItem[]`; extend function destructure; extend tab ternary with `tab === \'activity\'` branch routing to `<ActivityTab activityFeed={activityFeed} leadFamily={leadFamily} anchorLeadId={anchorLead.id} />`. ' +
  '**Multi-tenant safety**: both source queries `.eq(\'tenant_id\', anchorLead.tenant_id)` (trusted from W4a cross-tenant gate); cross-tenant activity leak impossible by design. Activity row may surface across multiple leads in same family if contact_email matches (intent: cumulative journey view). ' +
  '**Design choices**: button + `window.open` used for page_url click-through instead of `\u003ca\u003e` anchor element -- avoids chat-sanitization issue that bit W4b (workflow note from F-W4B-CHAT-ANCHOR-SANITIZATION). Functional equivalent for "click to open URL in new tab"; loses anchor-tag accessibility semantics in trade for transmission safety. ' +
  '**NEW finding F-W4D-ADMIN-ACTIONS-NOT-POPULATED**: `lead_admin_actions` returns 0 rows (B5 probe). Table created in W2 but no admin endpoint writes to it yet; W6a is the population phase. Activity timeline degrades gracefully to visitor-only until W6a lands. Not a defect -- expected per phase sequence. ' +
  '**NEW finding F-W4D-NO-PAGINATION-BEYOND-500**: each source query caps at 500 rows. Heavy users with > 500 visitor events would miss older history. Acceptable for MVP; proper pagination deferred to W6/W7. ' +
  '**NEW finding F-W4D-NO-AGENT-NAME-RESOLUTION**: `user_activities.agent_id` is fetched but not joined to `agents` for display name. Currently shown as raw UUID (or hidden). Future enhancement to join + display agent attribution. ' +
  'TSC --noEmit exit 0. Local dev server running. ' +
  'NEXT: W4e Emails tab + Send composer -- list `lead_email_recipients_log` per family (already pre-fetched pattern from leads list) + new `POST /api/admin-homes/leads/[id]/send-email` endpoint with audit logging to `lead_admin_actions` (first writer to the audit table).\n'

if (!txt.endsWith('\n')) txt += '\n'
txt += entry

fs.writeFileSync(filePath, txt, 'utf8')
console.log('  WROTE  ' + TRACKER + ' (' + txt.length + ' bytes)')