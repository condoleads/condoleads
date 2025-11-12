import { NextRequest, NextResponse } from 'next/server'
import { sendLeadNotificationToAgent } from '@/lib/email/resend'

export async function POST(request: NextRequest) {
  try {
    const { testEmail } = await request.json()

    console.log(' Sending test email to:', testEmail)

    const result = await sendLeadNotificationToAgent({
      agentEmail: testEmail,
      agentName: 'Mary Smith',
      leadName: 'Test Lead',
      leadEmail: 'testlead@example.com',
      leadPhone: '416-555-1234',
      source: 'Test System',
      buildingName: 'X2 Condos',
      listingAddress: '101 Charles St E, Unit 2503',
      message: 'This is a test lead notification from your CondoLeads platform!',
      estimatedValue: '$750,000 - $800,000'
    })

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: 'Email sent successfully!' 
      })
    } else {
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error('❌ Error in test-email API:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
