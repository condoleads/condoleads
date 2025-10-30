import { Resend } from 'resend'

// Initialize Resend - this should only run server-side
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY
  
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not set in environment variables')
  }
  
  return new Resend(apiKey)
}

interface SendLeadNotificationParams {
  agentEmail: string
  agentName: string
  leadName: string
  leadEmail: string
  leadPhone?: string
  source: string
  buildingName?: string
  listingAddress?: string
  message?: string
  estimatedValue?: string
}

export async function sendLeadNotificationToAgent(params: SendLeadNotificationParams) {
  try {
    const resend = getResendClient()
    
    const { data, error } = await resend.emails.send({
      from: 'CondoLeads <onboarding@resend.dev>', // Using Resend's test domain
      to: [params.agentEmail],
      subject: ` New Lead: ${params.leadName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .lead-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea; }
              .info-row { margin: 10px 0; }
              .label { font-weight: bold; color: #667eea; }
              .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;"> New Lead!</h1>
                <p style="margin: 10px 0 0 0;">You have a new inquiry from your website</p>
              </div>
              
              <div class="content">
                <h2>Lead Details</h2>
                
                <div class="lead-info">
                  <div class="info-row">
                    <span class="label">Name:</span> ${params.leadName}
                  </div>
                  <div class="info-row">
                    <span class="label">Email:</span> <a href="mailto:${params.leadEmail}">${params.leadEmail}</a>
                  </div>
                  ${params.leadPhone ? `
                    <div class="info-row">
                      <span class="label">Phone:</span> <a href="tel:${params.leadPhone}">${params.leadPhone}</a>
                    </div>
                  ` : ''}
                  <div class="info-row">
                    <span class="label">Source:</span> ${params.source}
                  </div>
                  ${params.buildingName ? `
                    <div class="info-row">
                      <span class="label">Building:</span> ${params.buildingName}
                    </div>
                  ` : ''}
                  ${params.listingAddress ? `
                    <div class="info-row">
                      <span class="label">Property:</span> ${params.listingAddress}
                    </div>
                  ` : ''}
                  ${params.estimatedValue ? `
                    <div class="info-row">
                      <span class="label">Estimated Value:</span> ${params.estimatedValue}
                    </div>
                  ` : ''}
                  ${params.message ? `
                    <div class="info-row">
                      <span class="label">Message:</span>
                      <p style="margin: 10px 0; padding: 15px; background: #f5f5f5; border-radius: 5px;">
                        ${params.message}
                      </p>
                    </div>
                  ` : ''}
                </div>
                
                <p style="margin: 20px 0;">
                  <strong>Respond quickly to increase your chances of converting this lead!</strong>
                </p>
                
                <a href="mailto:${params.leadEmail}" class="button">
                  Reply to ${params.leadName}
                </a>
              </div>
              
              <div class="footer">
                <p>This notification was sent by CondoLeads</p>
              </div>
            </div>
          </body>
        </html>
      `
    })

    if (error) {
      console.error(' Error sending email:', error)
      return { success: false, error }
    }

    console.log(' Email sent successfully:', data)
    return { success: true, data }
  } catch (error) {
    console.error(' Exception sending email:', error)
    return { success: false, error }
  }
}

interface SendWelcomeEmailParams {
  userEmail: string
  userName: string
  agentName: string
  agentWebsite: string
}

export async function sendWelcomeEmail(params: SendWelcomeEmailParams) {
  try {
    const resend = getResendClient()
    
    const { data, error } = await resend.emails.send({
      from: 'CondoLeads <onboarding@resend.dev>',
      to: [params.userEmail],
      subject: `Welcome to ${params.agentName}'s Real Estate Portal`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .features { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .feature { margin: 15px 0; padding-left: 30px; position: relative; }
              .feature:before { content: ""; position: absolute; left: 0; color: #667eea; font-weight: bold; font-size: 20px; }
              .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">Welcome, ${params.userName}! </h1>
                <p style="margin: 10px 0 0 0;">Thank you for registering with ${params.agentName}</p>
              </div>
              
              <div class="content">
                <p>Hi ${params.userName},</p>
                
                <p>Welcome to your personalized real estate portal! You now have access to:</p>
                
                <div class="features">
                  <div class="feature">View detailed property listings</div>
                  <div class="feature">Get instant property valuations</div>
                  <div class="feature">Access exclusive market insights</div>
                  <div class="feature">Contact ${params.agentName} directly</div>
                  <div class="feature">Save your favorite properties</div>
                </div>
                
                <p>Start exploring available properties and get personalized assistance from ${params.agentName}.</p>
                
                <center>
                  <a href="${params.agentWebsite}" class="button">
                    Explore Properties
                  </a>
                </center>
                
                <p style="margin-top: 30px;">
                  <strong>Need help?</strong><br>
                  ${params.agentName} is here to assist you. Feel free to reach out with any questions!
                </p>
              </div>
              
              <div class="footer">
                <p>You're receiving this email because you registered at ${params.agentWebsite}</p>
              </div>
            </div>
          </body>
        </html>
      `
    })

    if (error) {
      console.error(' Error sending welcome email:', error)
      return { success: false, error }
    }

    console.log(' Welcome email sent successfully:', data)
    return { success: true, data }
  } catch (error) {
    console.error(' Exception sending welcome email:', error)
    return { success: false, error }
  }
}
