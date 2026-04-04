import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone, company, plan, message } = await req.json()
    if (!name || !email) return NextResponse.json({ error: 'Name and email required' }, { status: 400 })

    await resend.emails.send({
      from: '01leads <notifications@condoleads.ca>',
      to: 'condoleads.ca@gmail.com',
      subject: `New 01leads inquiry — ${plan || 'General'} — ${name}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#3b82f6">New 01leads.com Inquiry</h2>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Name</td><td style="padding:8px;border-bottom:1px solid #eee">${name}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Email</td><td style="padding:8px;border-bottom:1px solid #eee">${email}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Phone</td><td style="padding:8px;border-bottom:1px solid #eee">${phone || '—'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Company</td><td style="padding:8px;border-bottom:1px solid #eee">${company || '—'}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold">Plan Interest</td><td style="padding:8px;border-bottom:1px solid #eee">${plan || '—'}</td></tr>
            <tr><td style="padding:8px;font-weight:bold">Message</td><td style="padding:8px">${message || '—'}</td></tr>
          </table>
        </div>
      `
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 })
  }
}