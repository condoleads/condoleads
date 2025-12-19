interface ActivityEmailData {
  agentName: string
  leadName: string
  leadEmail: string
  leadPhone?: string
  buildingName?: string
  buildingAddress?: string
  unitNumber?: string
  latestActivity: {
    type: string
    description: string
    details?: string
    timestamp: string
  }
  recentActivities: Array<{
    icon: string
    type: string
    description: string
    timestamp: string
    buildingInfo?: string
  }>
  keyMilestones?: Array<{
    icon: string
    type: string
    description: string
    timestamp: string
    buildingInfo?: string
  }>
  engagementScore: string
  engagementText: string
  totalActivityCount: number
  leadUrl: string
  callUrl?: string
  whatsappUrl?: string
  isManagerNotification?: boolean
  isAdminNotification?: boolean
  teamAgentName?: string
  teamManagerName?: string
}

export function generateActivityEmailHtml(data: ActivityEmailData): string {
  const activityIcons: Record<string, string> = {
    contact_form: 'Ã°Å¸â€œÂ§',
    property_inquiry: 'Ã°Å¸ÂÂ¢',
    estimator_used: 'Ã°Å¸â€™Â°',
    estimator_contact_submitted: 'Ã°Å¸â€œÅ¾',
    sale_evaluation_request: 'Ã°Å¸â€œÅ ',
    lease_evaluation_request: 'Ã°Å¸â€œâ€¹',
    building_visit_request: 'Ã°Å¸Ââ€”Ã¯Â¸Â',
    viewed_transaction_history: 'Ã°Å¸â€œË†',
    registration: 'Ã¢Å“â€¦'
  }

  const activityNames: Record<string, string> = {
    contact_form: 'Contact Form Submission',
    property_inquiry: 'Property Inquiry',
    estimator_used: 'Used Price Estimator',
    estimator_contact_submitted: 'Requested Agent Contact',
    sale_evaluation_request: 'Requested Sale Evaluation',
    lease_evaluation_request: 'Requested Lease Evaluation',
    building_visit_request: 'Requested Building Visit',
    viewed_transaction_history: 'Viewed Transaction History',
    registration: 'New User Registration'
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
    .badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; margin-top: 10px; }
    .hot { background: #ef4444; color: white; }
    .warm { background: #f59e0b; color: white; }
    .cold { background: #6b7280; color: white; }
    .section { background: white; padding: 25px; border-left: 4px solid #667eea; margin: 20px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .section-title { font-size: 14px; text-transform: uppercase; color: #6b7280; font-weight: 600; margin-bottom: 15px; letter-spacing: 0.5px; }
    .latest-action { background: #f3f4f6; padding: 20px; border-radius: 8px; border-left: 4px solid #10b981; }
    .activity-item { padding: 15px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: start; }
    .activity-item:last-child { border-bottom: none; }
    .activity-icon { font-size: 24px; margin-right: 12px; }
    .activity-content { flex: 1; }
    .activity-type { font-weight: 600; color: #111827; margin-bottom: 4px; }
    .activity-time { font-size: 13px; color: #6b7280; }
    .engagement { text-align: center; padding: 20px; background: #f9fafb; border-radius: 8px; }
    .engagement-score { font-size: 32px; margin-bottom: 10px; }
    .engagement-text { font-size: 16px; color: #374151; font-weight: 500; }
    .actions { display: flex; gap: 10px; margin-top: 25px; }
    .btn { flex: 1; padding: 14px 20px; text-align: center; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-block; }
    .btn-primary { background: #667eea; color: white; }
    .btn-success { background: #10b981; color: white; }
    .btn-secondary { background: #6b7280; color: white; }
    .contact-info { background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .contact-row { display: flex; align-items: center; margin: 8px 0; }
    .contact-label { font-weight: 600; min-width: 80px; color: #6b7280; }
    .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="margin: 0; font-size: 24px;">${data.engagementScore} Lead Activity</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">${data.leadName} just took action!</p>
      ${data.teamAgentName ? `<p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">${data.isAdminNotification ? "Admin View" : "Team Lead"} - Agent: ${data.teamAgentName}${data.teamManagerName ? " | Manager: " + data.teamManagerName : ""}</p>` : ""}
    <span class="badge ${data.engagementScore.includes('HOT') ? 'hot' : data.engagementScore.includes('WARM') ? 'warm' : 'cold'}">${data.totalActivityCount} Total Actions</span>
  </div>

  <div style="background: white; padding: 30px;">
    <div class="section">
      <div class="section-title">Ã°Å¸â€œÂ LATEST ACTION</div>
      <div class="latest-action">
        <div style="font-size: 24px; margin-bottom: 10px;">${activityIcons[data.latestActivity.type] || 'Ã°Å¸â€œÅ’'}</div>
        <div style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 8px;">${activityNames[data.latestActivity.type] || data.latestActivity.description}</div>
        ${data.latestActivity.details ? `<div style="color: #6b7280; margin-bottom: 8px;">${data.latestActivity.details}</div>` : ''}
        ${data.buildingName ? `<div style="color: #667eea; font-weight: 500;">Ã°Å¸ÂÂ¢ ${data.buildingName}${data.unitNumber ? ` Ã¢â‚¬Â¢ Unit ${data.unitNumber}` : ``}${data.buildingAddress ? ` Ã¢â‚¬Â¢ ${data.buildingAddress}` : ``}</div>` : ''}
        <div style="color: #6b7280; font-size: 13px; margin-top: 8px;">Ã¢ÂÂ° ${data.latestActivity.timestamp}</div>
      </div>
    </div>

    ${data.keyMilestones && data.keyMilestones.length > 0 ? `
      <div class="section">
        <div class="section-title">Ã¢Â­Â KEY MILESTONES (${data.keyMilestones.length} important actions)</div>
        ${data.keyMilestones.map(activity => `
          <div class="activity-item">
            <div class="activity-icon">${activity.icon}</div>
            <div class="activity-content">
              <div class="activity-type">${activity.type}</div>
              <div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">${activity.description}</div>
              ${activity.buildingInfo ? `<div style="color: #667eea; font-size: 13px; margin-bottom: 4px;">Ã°Å¸ÂÂ¢ ${activity.buildingInfo}</div>` : ''}
              <div class="activity-time">${activity.timestamp}</div>
            </div>
          </div>
        `).join('')}
      </div>
      ` : ''}

      <div class="section">
        <div class="section-title">Ã°Å¸â€œÅ  RECENT ACTIVITY (Last ${Math.min(data.recentActivities.length, 20)})</div>
        ${data.recentActivities.slice(0, 20).map(activity => `
        <div class="activity-item">
          <div class="activity-icon">${activity.icon}</div>
          <div class="activity-content">
            <div class="activity-type">${activity.type}</div>
            <div style="color: #6b7280; font-size: 14px; margin-bottom: 4px;">${activity.description}</div>
            ${activity.buildingInfo ? `<div style="color: #667eea; font-size: 13px; margin-bottom: 4px;">Ã°Å¸ÂÂ¢ ${activity.buildingInfo}</div>` : ''}
            <div class="activity-time">${activity.timestamp}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="section">
      <div class="section-title">Ã°Å¸Å½Â¯ ENGAGEMENT SCORE</div>
      <div class="engagement">
        <div class="engagement-score">${data.engagementScore}</div>
        <div class="engagement-text">${data.engagementText}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Ã°Å¸â€˜Â¤ CONTACT INFO</div>
      <div class="contact-info">
        <div class="contact-row">
          <div class="contact-label">Name:</div>
          <div>${data.leadName}</div>
        </div>
        <div class="contact-row">
          <div class="contact-label">Email:</div>
          <div><a href="mailto:${data.leadEmail}" style="color: #667eea;">${data.leadEmail}</a></div>
        </div>
        ${data.leadPhone ? `
        <div class="contact-row">
          <div class="contact-label">Phone:</div>
          <div><a href="tel:${data.leadPhone}" style="color: #667eea;">${data.leadPhone}</a></div>
        </div>
        ` : ''}
      </div>
    </div>

    <div class="actions">
      <a href="${data.leadUrl}" class="btn btn-primary">Ã°Å¸â€œâ€¹ View Full Lead</a>
      ${data.callUrl ? `<a href="${data.callUrl}" class="btn btn-success">Ã°Å¸â€œÅ¾ Call Now</a>` : ''}
      ${data.whatsappUrl ? `<a href="${data.whatsappUrl}" class="btn btn-success">Ã°Å¸â€™Â¬ WhatsApp</a>` : ''}
    </div>
  </div>

  <div class="footer">
    <p>This is an automated notification from CondoLeads.</p>
    <p>Respond quickly to convert hot leads! Ã¢Å¡Â¡</p>
  </div>
</body>
</html>
  `
}
