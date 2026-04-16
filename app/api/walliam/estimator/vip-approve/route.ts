// app/api/walliam/estimator/vip-approve/route.ts
// Token-based approve/deny for WALLiam estimator VIP requests
// Adapted from app/api/chat/vip-approve/route.ts — System 1 never touched
// Key differences:
//   - Redirects to /admin-homes/leads
//   - FROM: notifications@condoleads.ca
//   - WALLiam dark theme HTML response

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'WALLiam <notifications@condoleads.ca>'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const action = searchParams.get('action')

    if (!token || !action) return createHtmlResponse('error', 'Invalid request. Missing token or action.')
    if (!['approve', 'deny'].includes(action)) return createHtmlResponse('error', 'Invalid action.')

    const supabase = createServiceClient()

    const { data: vipRequest, error: findError } = await supabase
      .from('vip_requests')
      .select(`
        *,
        chat_sessions (*),
        agents (
          full_name, email, notification_email,
          ai_manual_approve_limit
        )
      `)
      .eq('approval_token', token)
      .single()

    if (findError || !vipRequest) return createHtmlResponse('error', 'Request not found or link has expired.')
    if (vipRequest.status !== 'pending') return createHtmlResponse('already_processed', `This request was already ${vipRequest.status}.`)
    if (new Date(vipRequest.expires_at) < new Date()) {
      await supabase.from('vip_requests').update({ status: 'expired' }).eq('id', vipRequest.id)
      return createHtmlResponse('expired', 'This request has expired.')
    }

    const newStatus = action === 'approve' ? 'approved' : 'denied'
    const agent = vipRequest.agents
    const tenantId = vipRequest.chat_sessions?.tenant_id
    // Fetch manager for CC
    let managerEmail = null
    if (agent?.parent_id) {
      const { data: mgr } = await supabase.from('agents').select('email, notification_email').eq('id', agent.parent_id).single()
      if (mgr) managerEmail = mgr.notification_email || mgr.email
    }
    let attemptsToGrant = 3
    if (tenantId) {
      const { data: tenantCfg } = await supabase.from('tenants').select('estimator_manual_approve_attempts, estimator_hard_cap').eq('id', tenantId).single()
      if (tenantCfg?.estimator_manual_approve_attempts != null) attemptsToGrant = tenantCfg.estimator_manual_approve_attempts
    }

    await supabase
      .from('vip_requests')
      .update({
        status: newStatus,
        responded_at: new Date().toISOString(),
        messages_granted: action === 'approve' ? attemptsToGrant : 0,
      })
      .eq('id', vipRequest.id)

    if (action === 'approve') {
      const currentGranted = vipRequest.chat_sessions?.vip_messages_granted || 0
      const currentApprovals = vipRequest.chat_sessions?.manual_approvals_count || 0

      await supabase
        .from('chat_sessions')
        .update({
          status: 'vip',
          vip_accepted_at: new Date().toISOString(),
          vip_phone: vipRequest.phone,
          vip_messages_granted: currentGranted + attemptsToGrant,
          manual_approvals_count: currentApprovals + 1,
          last_approval_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', vipRequest.session_id)

      // Write to user_credit_overrides
      const userId = vipRequest.chat_sessions?.user_id
      if (userId && tenantId) {
        const { data: tCfg } = await supabase.from('tenants').select('estimator_hard_cap').eq('id', tenantId).single()
        const estimatorUsed = vipRequest.chat_sessions?.estimator_count || 0
        const newLimit = Math.min(estimatorUsed + attemptsToGrant, tCfg?.estimator_hard_cap ?? 10)
        await supabase.from('user_credit_overrides').upsert({
          user_id: userId,
          tenant_id: tenantId,
          granted_by_agent_id: vipRequest.agent_id || null,
          granted_by_tier: 'manager',
          note: 'Email approval — ' + attemptsToGrant + ' estimator credits granted',
          estimator_limit: newLimit,
          granted_at: new Date().toISOString(),
        }, { onConflict: 'user_id,tenant_id' })
      }
      if (vipRequest.email) {
        try {
          await resend.emails.send({
            from: FROM,
            to: vipRequest.email,
            cc: managerEmail ? [managerEmail] : undefined,
            bcc: 'condoleads.ca@gmail.com',
            subject: '✨ Your WALLiam Estimator Access is Approved',
            html: buildUserApprovalEmailHtml(
              vipRequest.full_name,
              agent?.full_name || 'WALLiam',
              attemptsToGrant
            ),
          })
        } catch (err) {
          console.error('[walliam/estimator/vip-approve] user email error:', err)
        }
      }

      return createHtmlResponse('approved', `Estimator access granted to ${vipRequest.full_name || vipRequest.phone}. They now have ${attemptsToGrant} additional estimate${attemptsToGrant > 1 ? 's' : ''}.`)
    } else {
      return createHtmlResponse('denied', `Estimator VIP request from ${vipRequest.full_name || vipRequest.phone} has been denied.`)
    }

  } catch (error) {
    console.error('[walliam/estimator/vip-approve] error:', error)
    return createHtmlResponse('error', 'An unexpected error occurred.')
  }
}

function buildUserApprovalEmailHtml(userName: string, agentName: string, attemptsGranted: number): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">✦</div>
        <h1 style="color: white; margin: 0; font-size: 24px;">Estimator Access Approved</h1>
        <p style="color: rgba(255,255,255,0.5); margin: 8px 0 0;">WALLiam AI Real Estate</p>
      </div>
      <div style="background: #f8fafc; padding: 28px; border: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">Hi ${userName || 'there'},</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 24px;"><strong>${agentName}</strong> has approved your estimator access. You now have <strong>${attemptsGranted} additional estimate${attemptsGranted > 1 ? 's' : ''}</strong> available.</p>
        <div style="text-align: center;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://walliam.ca'}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px;">✦ Back to WALLiam</a>
        </div>
      </div>
    </div>
  `
}

function createHtmlResponse(status: string, message: string): NextResponse {
  const configs: Record<string, { bg: string; icon: string; title: string }> = {
    approved:          { bg: '#10b981', icon: '✅', title: 'Approved' },
    denied:            { bg: '#ef4444', icon: '❌', title: 'Denied' },
    error:             { bg: '#ef4444', icon: '⚠️', title: 'Error' },
    expired:           { bg: '#f59e0b', icon: '⏰', title: 'Expired' },
    already_processed: { bg: '#64748b', icon: 'ℹ️', title: 'Already Processed' },
  }
  const cfg = configs[status] || configs.error

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>WALLiam Estimator — ${cfg.title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #1e293b; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; max-width: 400px; width: 100%; overflow: hidden; }
    .header { background: ${cfg.bg}; padding: 32px; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 12px; }
    .title { color: white; font-size: 22px; font-weight: 700; }
    .content { padding: 24px; text-align: center; }
    .message { color: rgba(255,255,255,0.7); font-size: 15px; line-height: 1.6; }
    .footer { padding: 0 24px 24px; text-align: center; }
    .btn { display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #1d4ed8, #4f46e5); color: white; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="icon">${cfg.icon}</div>
      <div class="title">${cfg.title}</div>
    </div>
    <div class="content"><p class="message">${message}</p></div>
    <div class="footer"><a href="/admin-homes/leads" class="btn">Go to Dashboard</a></div>
  </div>
</body>
</html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } })
}