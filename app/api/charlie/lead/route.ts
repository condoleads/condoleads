// app/api/charlie/lead/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import { saveLead, LeadData } from '@/app/charlie/lib/charlie-plan'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const agent = await getAgentFromHost(host)

  const body = await req.json()
  const { name, email, phone, intent, buyerProfile, sellerProfile, listings, analytics } = body

  if (!name || !email || !intent) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const leadData: LeadData = {
    agentId: agent?.id,
    name,
    email,
    phone,
    intent,
    buyerProfile,
    sellerProfile,
    listings: listings?.slice(0, 5),
    analytics,
  }

  const lead = await saveLead(leadData)
  if (!lead) {
    return NextResponse.json({ error: 'Failed to save lead' }, { status: 500 })
  }

  // Send agent notification
  if (agent?.email) {
    const profile = intent === 'buyer' ? buyerProfile : sellerProfile
    const subject = `New ${intent === 'buyer' ? 'Buyer' : 'Seller'} Lead — ${name} — ${profile?.geoName || 'Unknown Area'}`

    const topListings = (listings || []).slice(0, 3).map((l: any) =>
      `<li><strong>$${l.list_price?.toLocaleString()}</strong> — ${l.unparsed_address} (${l.bedrooms_total} bed)</li>`
    ).join('')

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #0f172a; padding: 24px; border-radius: 12px; margin-bottom: 20px;">
          <h1 style="color: #fff; margin: 0; font-size: 22px;">New ${intent === 'buyer' ? '🏠 Buyer' : '💰 Seller'} Lead</h1>
          <p style="color: #94a3b8; margin: 8px 0 0;">via Charlie AI — ${new Date().toLocaleDateString('en-CA')}</p>
        </div>

        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 16px;">
          <h2 style="margin: 0 0 12px; font-size: 16px;">Contact Info</h2>
          <p style="margin: 4px 0;"><strong>Name:</strong> ${name}</p>
          <p style="margin: 4px 0;"><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          ${phone ? `<p style="margin: 4px 0;"><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>` : ''}
        </div>

        ${intent === 'buyer' && buyerProfile ? `
        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 16px;">
          <h2 style="margin: 0 0 12px; font-size: 16px;">Buyer Profile</h2>
          <p style="margin: 4px 0;"><strong>Area:</strong> ${buyerProfile.geoName}</p>
          ${buyerProfile.budgetMax ? `<p style="margin: 4px 0;"><strong>Budget:</strong> $${buyerProfile.budgetMin?.toLocaleString() || '0'} — $${buyerProfile.budgetMax?.toLocaleString()}</p>` : ''}
          ${buyerProfile.propertyType ? `<p style="margin: 4px 0;"><strong>Type:</strong> ${buyerProfile.propertyType}</p>` : ''}
          ${buyerProfile.bedrooms ? `<p style="margin: 4px 0;"><strong>Bedrooms:</strong> ${buyerProfile.bedrooms}+</p>` : ''}
          ${buyerProfile.timeline ? `<p style="margin: 4px 0;"><strong>Timeline:</strong> ${buyerProfile.timeline}</p>` : ''}
        </div>
        ` : ''}

        ${intent === 'seller' && sellerProfile ? `
        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 16px;">
          <h2 style="margin: 0 0 12px; font-size: 16px;">Seller Profile</h2>
          <p style="margin: 4px 0;"><strong>Area:</strong> ${sellerProfile.geoName}</p>
          ${sellerProfile.propertyType ? `<p style="margin: 4px 0;"><strong>Type:</strong> ${sellerProfile.propertyType}</p>` : ''}
          ${sellerProfile.estimatedValueMin ? `<p style="margin: 4px 0;"><strong>Est. Value:</strong> $${sellerProfile.estimatedValueMin?.toLocaleString()} — $${sellerProfile.estimatedValueMax?.toLocaleString()}</p>` : ''}
          ${sellerProfile.timeline ? `<p style="margin: 4px 0;"><strong>Timeline:</strong> ${sellerProfile.timeline}</p>` : ''}
          ${sellerProfile.goal ? `<p style="margin: 4px 0;"><strong>Goal:</strong> ${sellerProfile.goal}</p>` : ''}
        </div>
        ` : ''}

        ${topListings ? `
        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 16px;">
          <h2 style="margin: 0 0 12px; font-size: 16px;">Top Matched Listings</h2>
          <ul style="margin: 0; padding-left: 20px;">${topListings}</ul>
        </div>
        ` : ''}

        <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
          Sent by Charlie AI · CondoLeads
        </div>
      </div>
    `

    try {
      await resend.emails.send({
        from: 'Charlie <noreply@condoleads.ca>',
        to: agent.email,
        subject,
        html,
      })
    } catch (err) {
      console.error('[charlie-plan] Resend error:', err)
    }
  }

  return NextResponse.json({ success: true, leadId: lead.id })
}