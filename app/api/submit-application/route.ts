import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    
    // Format buildings list
    const buildingsList = data.buildings
      .map((b: any, i: number) => `Building ${i + 1}: ${b.name} - ${b.address}`)
      .filter((b: string) => b.includes('-'))
      .join('\n')

    // Create email body
    const emailBody = `
New CondoLeads Application Received!

===== CONTACT INFORMATION =====
Name: ${data.fullName}
Email: ${data.email}
Phone: ${data.phone}
Brokerage: ${data.brokerage}

===== TARGET MARKET =====
Primary Market Area: ${data.marketArea}
${data.manualMarketArea ? `Additional Areas: ${data.manualMarketArea}` : ''}

===== TARGET BUILDINGS =====
${buildingsList}

===== EXPERIENCE =====
Condo Market Experience:
${data.condoExperience}

Digital Marketing Background:
${data.digitalMarketing}

===== INVESTMENT & TIMELINE =====
Budget: ${data.budget}
Timeline: ${data.timeline}

===== ADDITIONAL INFO =====
${data.additionalInfo || 'None provided'}

===== NEXT STEPS =====
Schedule a 15-minute strategy call to discuss their application.
    `

    // Send email using Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: 'condoleads.ca@gmail.com',
        subject: `🎯 New Application: ${data.fullName} - ${data.marketArea}`,
        text: emailBody
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Resend API error:', errorData)
      throw new Error(`Failed to send email: ${JSON.stringify(errorData)}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Application submission error:', error)
    return NextResponse.json(
      { error: 'Failed to submit application' },
      { status: 500 }
    )
  }
}

