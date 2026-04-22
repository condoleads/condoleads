// app/api/paddle/webhook/route.ts
// Receives Paddle webhook events, verifies signature, emails Shah on key events.
// Verified signature is REQUIRED — otherwise anyone can spoof payment events.

import { NextRequest, NextResponse } from 'next/server'
import { Paddle, EventName, Environment } from '@paddle/paddle-node-sdk'
import { Resend } from 'resend'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOTIFY_TO = 'condoleads.ca@gmail.com'
const NOTIFY_FROM = '01leads <notifications@condoleads.ca>'

function getPaddleClient(): Paddle {
  const apiKey = process.env.PADDLE_API_KEY
  if (!apiKey) throw new Error('PADDLE_API_KEY not set')
  return new Paddle(apiKey, {
    environment: Environment.production,
  })
}

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not set')
  return new Resend(key)
}

function fmt(val: unknown): string {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'string') return val
  try { return JSON.stringify(val) } catch { return String(val) }
}

function moneyLine(totals: any): string {
  if (!totals) return '-'
  const total = totals.total ? (Number(totals.total) / 100).toFixed(2) : '-'
  const currency = totals.currency_code || totals.currencyCode || ''
  return `${total} ${currency}`.trim()
}

async function sendAlertEmail(subject: string, htmlBody: string) {
  try {
    const resend = getResend()
    await resend.emails.send({
      from: NOTIFY_FROM,
      to: NOTIFY_TO,
      subject,
      html: htmlBody,
    })
  } catch (err) {
    console.error('[paddle-webhook] email send failed:', err)
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET
  if (!secret) {
    console.error('[paddle-webhook] PADDLE_WEBHOOK_SECRET not set — rejecting')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const signature = req.headers.get('paddle-signature') || ''
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  const rawBody = await req.text()

  let event: any
  try {
    const paddle = getPaddleClient()
    event = await paddle.webhooks.unmarshal(rawBody, secret, signature)
  } catch (err: any) {
    console.error('[paddle-webhook] signature verification failed:', err?.message || err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  console.log('[paddle-webhook] received:', event.eventType)

  try {
    switch (event.eventType) {
      case EventName.TransactionCompleted: {
        const t = event.data
        const html = `
          <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:20px">
            <h2 style="color:#10b981;margin:0 0 16px">Payment Received</h2>
            <p style="color:#555;margin:0 0 16px">A customer just completed checkout on 01leads.com.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;width:180px">Transaction ID</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(t.id)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Status</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(t.status)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Total</td><td style="padding:8px;border-bottom:1px solid #eee"><strong>${moneyLine(t.details?.totals)}</strong></td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Customer ID</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(t.customerId || t.customer_id)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Subscription ID</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(t.subscriptionId || t.subscription_id)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Created</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(t.createdAt || t.created_at)}</td></tr>
            </table>
            <p style="margin-top:20px;color:#888;font-size:12px">Log into Paddle dashboard to see full details and customer email.</p>
          </div>
        `
        await sendAlertEmail(`[01leads] Payment received — ${moneyLine(t.details?.totals)}`, html)
        break
      }

      case EventName.SubscriptionCreated: {
        const s = event.data
        const html = `
          <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:20px">
            <h2 style="color:#3b82f6;margin:0 0 16px">New Subscription</h2>
            <p style="color:#555;margin:0 0 16px">A customer started a subscription on 01leads.com. If they paid a setup fee, they're in the 30-day trial window — first recurring charge on the next_billed_at date.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;width:180px">Subscription ID</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(s.id)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Status</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(s.status)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Customer ID</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(s.customerId || s.customer_id)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Next billed at</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(s.nextBilledAt || s.next_billed_at)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Items</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(s.items)}</td></tr>
            </table>
            <p style="margin-top:20px;color:#888;font-size:12px">This is the customer to onboard. Check Paddle dashboard for their email.</p>
          </div>
        `
        await sendAlertEmail(`[01leads] New subscription — ${fmt(s.id)}`, html)
        break
      }

      case EventName.SubscriptionCanceled: {
        const s = event.data
        const html = `
          <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:20px">
            <h2 style="color:#ef4444;margin:0 0 16px">Subscription Cancelled</h2>
            <p style="color:#555;margin:0 0 16px">A customer cancelled their subscription.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;width:180px">Subscription ID</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(s.id)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Customer ID</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(s.customerId || s.customer_id)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Cancelled at</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(s.canceledAt || s.canceled_at)}</td></tr>
            </table>
          </div>
        `
        await sendAlertEmail(`[01leads] Subscription cancelled — ${fmt(s.id)}`, html)
        break
      }

      case EventName.TransactionPaymentFailed: {
        const t = event.data
        const html = `
          <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:20px">
            <h2 style="color:#f59e0b;margin:0 0 16px">Payment Failed</h2>
            <p style="color:#555;margin:0 0 16px">A customer's payment failed. Paddle will retry automatically.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;width:180px">Transaction ID</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(t.id)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Customer ID</td><td style="padding:8px;border-bottom:1px solid #eee">${fmt(t.customerId || t.customer_id)}</td></tr>
              <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Total</td><td style="padding:8px;border-bottom:1px solid #eee">${moneyLine(t.details?.totals)}</td></tr>
            </table>
          </div>
        `
        await sendAlertEmail(`[01leads] Payment failed — ${moneyLine(t.details?.totals)}`, html)
        break
      }

      default:
        // Log-only for other events; no email spam
        console.log('[paddle-webhook] unhandled event:', event.eventType)
        break
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err: any) {
    console.error('[paddle-webhook] handler error:', err)
    // Still return 200 so Paddle does not retry indefinitely
    return NextResponse.json({ received: true, handler_error: true }, { status: 200 })
  }
}

// Reject non-POST
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}