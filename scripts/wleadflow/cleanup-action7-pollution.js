#!/usr/bin/env node
// scripts/wleadflow/cleanup-action7-pollution.js
//
// Removes the polluted records created by Action 4 + Action 7 of W-LEAD-FLOW
// before today's URL-pattern correction.
//
// All UUIDs verified directly from PowerShell session output of those actions.
// Pollution justification: lead.source_url contains a fabricated /buildings/<slug>
// path that does not resolve (no app\buildings\ folder exists).

const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('ABORT: missing supabase env'); process.exit(1); }

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Verified UUIDs
const LEAD_ID      = '3128365a-4e02-4a20-9ce9-af67321c6350';
const VIP_REQ_ID   = '4c841345-f8b4-4344-bf4f-3ccd687ba7dc';
const SESSION_IDS  = [
  '727d470e-4403-478b-be4d-cf7e0a81ced0',  // Action 7 first clone
  'ddeed7b2-cf24-45f1-8978-df85d2e1cd31',  // Action 4 (pre-patch failed run) clone
];
const AUTH_USER_ID = 'a326b073-5b62-4937-a586-5c1cc1f4578c';

async function tryDeleteBy(table, col, val) {
  const { error, count } = await supabase.from(table).delete({ count: 'exact' }).eq(col, val);
  if (error) {
    if (error.code === '42P01') return { ok: true, count: 0, skipped: true };
    return { ok: false, error: error.message + (error.code ? ' [' + error.code + ']' : '') };
  }
  return { ok: true, count: count || 0 };
}

function logDel(name, r) {
  if (!r.ok) { console.log('  ' + name.padEnd(28) + ' ERROR: ' + r.error); return false; }
  const tag = r.skipped ? ' (table absent)' : '';
  console.log('  ' + name.padEnd(28) + ' deleted=' + r.count + tag);
  return true;
}

(async () => {
  let allOk = true;

  console.log('=== Pre-cleanup snapshot ===');
  const { data: leadPre }    = await supabase.from('leads').select('id, contact_email, source_url, lead_origin_route').eq('id', LEAD_ID).maybeSingle();
  const { data: vrPre }      = await supabase.from('vip_requests').select('id, status').eq('id', VIP_REQ_ID).maybeSingle();
  console.log('  lead         :', leadPre ? JSON.stringify(leadPre) : 'NOT FOUND');
  console.log('  vip_request  :', vrPre ? JSON.stringify(vrPre) : 'NOT FOUND');
  for (const sid of SESSION_IDS) {
    const { data } = await supabase.from('chat_sessions').select('id, user_id, source').eq('id', sid).maybeSingle();
    console.log('  chat_session ', sid, ':', data ? JSON.stringify(data) : 'NOT FOUND');
  }
  const { data: authPre } = await supabase.auth.admin.getUserById(AUTH_USER_ID);
  console.log('  auth user    :', authPre && authPre.user ? authPre.user.email : 'NOT FOUND');
  const authEmail = authPre && authPre.user ? authPre.user.email : null;
  console.log('');

  console.log('=== Phase 1: audit-trail children of lead ===');
  for (const t of ['lead_admin_actions', 'email_recipients_log', 'lead_email_logs', 'notifications']) {
    if (!logDel(t, await tryDeleteBy(t, 'lead_id', LEAD_ID))) allOk = false;
  }
  if (authEmail) {
    if (!logDel('user_activities (by email)', await tryDeleteBy('user_activities', 'contact_email', authEmail))) allOk = false;
  }
  console.log('');

  console.log('=== Phase 2: lead row ===');
  if (!logDel('leads', await tryDeleteBy('leads', 'id', LEAD_ID))) allOk = false;
  console.log('');

  console.log('=== Phase 3: vip_request row ===');
  if (!logDel('vip_requests', await tryDeleteBy('vip_requests', 'id', VIP_REQ_ID))) allOk = false;
  console.log('');

  console.log('=== Phase 4: chat_messages then chat_sessions ===');
  for (const sid of SESSION_IDS) {
    if (!logDel('chat_messages (sid=' + sid.substring(0,8) + ')', await tryDeleteBy('chat_messages', 'session_id', sid))) allOk = false;
  }
  for (const sid of SESSION_IDS) {
    if (!logDel('chat_sessions (id=' + sid.substring(0,8) + ')', await tryDeleteBy('chat_sessions', 'id', sid))) allOk = false;
  }
  console.log('');

  console.log('=== Phase 5: auth.users children (FK referencing the auth user) ===');
  if (!logDel('user_credit_overrides', await tryDeleteBy('user_credit_overrides', 'user_id', AUTH_USER_ID))) allOk = false;
  if (!logDel('user_profiles',         await tryDeleteBy('user_profiles',         'id',      AUTH_USER_ID))) allOk = false;
  console.log('');

  console.log('=== Phase 6: auth user ===');
  const { error: authErr } = await supabase.auth.admin.deleteUser(AUTH_USER_ID);
  if (authErr) {
    console.log('  auth.admin.deleteUser ERROR: ' + authErr.message);
    allOk = false;
  } else {
    console.log('  auth user ' + AUTH_USER_ID + ' deleted');
  }
  console.log('');

  console.log('=== Post-cleanup verification ===');
  const { data: leadPost } = await supabase.from('leads').select('id').eq('id', LEAD_ID).maybeSingle();
  console.log('  lead         :', leadPost ? 'STILL EXISTS' : 'gone');
  const { data: vrPost }   = await supabase.from('vip_requests').select('id').eq('id', VIP_REQ_ID).maybeSingle();
  console.log('  vip_request  :', vrPost ? 'STILL EXISTS' : 'gone');
  for (const sid of SESSION_IDS) {
    const { data } = await supabase.from('chat_sessions').select('id').eq('id', sid).maybeSingle();
    console.log('  chat_session ', sid, ':', data ? 'STILL EXISTS' : 'gone');
  }
  const { data: authPost } = await supabase.auth.admin.getUserById(AUTH_USER_ID);
  console.log('  auth user    :', authPost && authPost.user ? 'STILL EXISTS' : 'gone');
  console.log('');

  console.log('=========================================================');
  console.log(allOk ? 'CLEANUP COMPLETE' : 'CLEANUP PARTIAL -- review errors above');
  process.exit(allOk ? 0 : 2);
})().catch(e => { console.error('FATAL:', e && e.stack ? e.stack : e); process.exit(1); });