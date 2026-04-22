// lib/tenant/default-content.ts
// Default content templates for /about, /privacy, /terms pages.
// Each tenant inherits this content unless they override via
// tenant.about_content / privacy_content / terms_content in the dashboard.
//
// Format: Markdown-ish — parser handles ## headings, ### subheadings,
// - bullets, **bold**, and blank-line paragraph breaks.

import type { Tenant } from './getTenant'

// Safe field accessor — returns fallback if field is null/empty
function f(value: string | null | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback
}

// Current date formatted for legal effective dates
function currentDate(): string {
  const now = new Date()
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
  return `${months[now.getMonth()]} ${now.getFullYear()}`
}

// ─── ABOUT ────────────────────────────────────────────────────────────
export function getDefaultAbout(tenant: Tenant): string {
  const brand = f(tenant.brand_name, f(tenant.name, 'WALLiam'))
  const brokerage = f(tenant.brokerage_name, 'our licensed brokerage')
  const broker = f(tenant.broker_of_record, '')
  const reco = f(tenant.license_number, '')
  const address = f(tenant.brokerage_address, '')
  const phone = f(tenant.brokerage_phone, '')
  const email = f(tenant.admin_email, '')

  const brokerageDetails = [
    `- **Brokerage:** ${brokerage}`,
    broker ? `- **Broker of Record:** ${broker}` : '',
    reco ? `- **RECO Registration #:** ${reco}` : '',
    address ? `- **Office:** ${address}` : '',
    phone ? `- **Phone:** ${phone}` : '',
    email ? `- **Email:** ${email}` : '',
  ].filter(Boolean).join('\n')

  return `## About ${brand}

${brand} is an AI-powered real estate platform serving the Greater Toronto Area. We help buyers and sellers turn questions into a personalized plan — then connect them with a licensed local expert who executes that plan.

## How It Works

Traditional real estate starts with a cold call. Ours starts with a conversation.

Tell our AI assistant what you're looking for — whether it's a first condo, a family home, or a seller's strategy — and you'll receive a tailored plan built on live MLS data, current comparable sales, and local market intelligence. No sign-up required to start.

Once your plan is ready, a licensed agent takes over. They already know your market, they've seen your plan, and they execute — so your first meeting is productive, not introductory.

## What You Get

- A custom AI-generated buyer plan or seller strategy based on your goals
- Live property data from the Toronto Regional Real Estate Board (TRREB)
- Comparable sales, market analytics, and neighbourhood-level insights
- Home valuation estimates drawn from real transaction data
- A licensed real estate agent who has your full context from day one

Browsing listings, chatting with the AI, and generating a plan is free to use. Certain features require registration.

## Our Brokerage

${brand} is operated by **${brokerage}**, a licensed real estate brokerage registered with the Real Estate Council of Ontario (RECO). All real estate services are provided by licensed agents affiliated with this brokerage, in accordance with the Real Estate and Business Brokers Act, 2002 (REBBA) and the rules of RECO.

${brokerageDetails}

## A Note on the AI

The AI assistant on this platform is a research and planning tool. It pulls from public MLS data, market analytics, and general real estate knowledge. It does not replace a licensed real estate agent and is not a substitute for professional real estate, legal, or financial advice. Every recommendation should be verified with your agent before acting.

## Get Started

Ready to begin? [Get my buyer plan](/#buyer) or [get my seller plan](/#seller) — it takes about 30 seconds.

Prefer to speak with someone first? [Contact us](/contact) and an agent will be in touch within one business day.`
}

// ─── PRIVACY POLICY ───────────────────────────────────────────────────
export function getDefaultPrivacy(tenant: Tenant): string {
  const brand = f(tenant.brand_name, f(tenant.name, 'WALLiam'))
  const brokerage = f(tenant.brokerage_name, 'our licensed brokerage')
  const address = f(tenant.brokerage_address, '')
  const phone = f(tenant.brokerage_phone, '')
  const email = f(tenant.admin_email, 'contact us through the website')
  const effective = currentDate()

  const contactLines = [
    `- **Email:** ${email}`,
    phone ? `- **Phone:** ${phone}` : '',
    address ? `- **Mail:** ${brokerage}, ${address}` : `- **Mail:** ${brokerage}`,
  ].filter(Boolean).join('\n')

  return `## Privacy Policy

**Effective date:** ${effective}

${brand}, operated by ${brokerage} ("we", "our", "us"), respects your privacy and is committed to protecting the personal information you share with us. This Privacy Policy explains what we collect, how we use it, and the choices you have. By using ${brand} (the "Service"), you agree to the practices described here.

## Information We Collect

### Information You Provide

- Name, email address, and phone number
- Property preferences (type, location, budget, timeline)
- Information shared through chat, forms, or AI-generated plan inputs
- Account credentials if you register for enhanced access

### Usage and Technical Data

- IP address, browser type and version, device identifiers
- Pages visited, time spent, features used
- Referral URLs and interaction patterns

### Location Data

If you grant permission, we use approximate location to show relevant listings. You can disable this in your browser or device settings at any time.

### Cookies

We use essential cookies for authentication, session management, and core functionality. We do not use advertising or third-party tracking cookies.

## How We Use Your Information

- To generate personalized buyer and seller plans
- To display relevant property listings and market analytics
- To connect you with a licensed agent from our brokerage
- To respond to your inquiries and provide support
- To improve the Service and diagnose technical issues
- To send transactional emails related to your plan, account, or inquiries
- To comply with legal obligations under PIPEDA and REBBA

**We do not sell your personal information.** We do not share it with advertisers or data brokers.

## AI Assistant and Automated Tools

When you use our AI-powered tools:

- Your conversation and inputs may be stored to improve service quality
- Your information may be shared with the licensed agent assigned to you
- AI-generated output is informational only and does not constitute professional real estate, legal, or financial advice
- Home valuations are algorithmic estimates, not appraisals

## MLS Data and VOW Registration

This Service displays real estate listing information from the Toronto Regional Real Estate Board (TRREB). To access certain features — including historical sales, sold prices, and detailed market data — you may be required to register for a Virtual Office Website (VOW) account and agree to additional MLS terms.

When you register as a VOW user, you acknowledge:

- The data is for your personal, non-commercial use only
- You will not copy, redistribute, or retransmit any listing information
- You will not use the data for mass mailing, solicitation, or commercial purposes
- The information is deemed reliable but is not guaranteed accurate

## Sharing Your Information

We share your information only with:

- **Your assigned licensed real estate agent** (affiliated with ${brokerage}) to facilitate service
- **Service providers** who process data on our behalf under confidentiality obligations (hosting, email delivery, analytics, AI infrastructure)
- **Legal authorities** when required by law or to protect our rights
- **TRREB and CREA** to the extent required under MLS and VOW agreements

## Data Storage and Security

Your data is stored on secured infrastructure in North America, protected by commercially reasonable technical and organizational measures including encryption in transit. No internet-based service is 100% secure, and we cannot guarantee absolute security.

## Data Retention

We retain personal information for as long as your account is active or as needed to provide the Service, comply with legal obligations, resolve disputes, and enforce our agreements. You may request deletion at any time by contacting us.

## Your Rights

Under PIPEDA and applicable provincial laws, you have the right to:

- Access the personal information we hold about you
- Request correction of inaccurate or incomplete data
- Request deletion of your data, subject to legal retention requirements
- Withdraw consent to marketing communications at any time
- File a complaint with the Office of the Privacy Commissioner of Canada

## Children's Privacy

The Service is not directed to anyone under 18. We do not knowingly collect personal information from minors.

## Changes to This Policy

We may update this Privacy Policy from time to time. Material changes will be indicated by updating the effective date at the top and, where appropriate, notifying you by email.

## Contact Us

For privacy questions or to exercise your rights:

${contactLines}

## MLS Trademark Notice

The trademarks REALTOR®, REALTORS®, and the REALTOR® logo are controlled by The Canadian Real Estate Association (CREA) and identify real estate professionals who are members of CREA. The trademarks MLS®, Multiple Listing Service®, and the associated logos are owned by CREA and identify the quality of services provided by real estate professionals who are members of CREA. Used under license. Data is deemed reliable but is not guaranteed accurate by TRREB.`
}

// ─── TERMS OF USE ─────────────────────────────────────────────────────
export function getDefaultTerms(tenant: Tenant): string {
  const brand = f(tenant.brand_name, f(tenant.name, 'WALLiam'))
  const brokerage = f(tenant.brokerage_name, 'our licensed brokerage')
  const broker = f(tenant.broker_of_record, '')
  const reco = f(tenant.license_number, '')
  const address = f(tenant.brokerage_address, '')
  const phone = f(tenant.brokerage_phone, '')
  const email = f(tenant.admin_email, 'contact us through the website')
  const effective = currentDate()

  const contactLines = [
    `- **${brokerage}**`,
    broker ? `- **Broker of Record:** ${broker}` : '',
    reco ? `- **RECO Registration #:** ${reco}` : '',
    address ? `- **Address:** ${address}` : '',
    phone ? `- **Phone:** ${phone}` : '',
    `- **Email:** ${email}`,
  ].filter(Boolean).join('\n')

  return `## Terms of Use

**Effective date:** ${effective}

Please read these Terms of Use ("Terms") carefully before using ${brand} (the "Service"), operated by ${brokerage}. By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.

## 1. Eligibility

You must be at least 18 years old and capable of forming a binding contract to use the Service.

## 2. Use of the Service

The Service provides real estate information, property listings, market analytics, and AI-powered planning tools for prospective buyers, sellers, and tenants in the Greater Toronto Area. By using the Service you agree to:

- Provide accurate, current, and complete information when submitting inquiries or creating an account
- Use the Service only for lawful, personal, non-commercial purposes
- Not resell, republish, or exploit any part of the Service without written consent
- Not attempt to gain unauthorized access to any portion of the Service
- Not interfere with, disrupt, or overload the Service

## 3. No Professional Advice

Information on the Service — including AI-generated plans, home valuations, comparable sales, market statistics, and listing data — is for informational purposes only. It does not constitute professional real estate, legal, financial, tax, or mortgage advice.

Always consult with a licensed real estate agent, lawyer, or financial advisor before making any real estate decision. Nothing on the Service creates an agency relationship until a formal buyer representation or listing agreement is signed.

## 4. Property Information Disclaimer

While we strive for accuracy, we make no warranties about:

- The completeness, accuracy, or timeliness of any listing
- The availability of any property shown on the Service
- The accuracy of prices, measurements, lot sizes, taxes, or descriptions
- Valuations, estimates, or market projections generated by AI tools

All property details must be independently verified. Home valuations produced by AI tools are algorithmic estimates, not appraisals.

## 5. MLS Data Terms

Listing information is provided through licensed data feeds from the Toronto Regional Real Estate Board (TRREB). By accessing this information, you agree:

- The data is for your personal, non-commercial use only
- You will not copy, redistribute, retransmit, scrape, or republish any listing information
- You will not use the data for mass mailing, solicitation, or commercial purposes
- You will not compile mailing lists or databases from the Service
- Unauthorized use may result in termination of access and legal action

## 6. Virtual Office Website (VOW) Terms

Certain features require VOW registration. By registering as a VOW user, you agree:

- You have a bona fide interest in the purchase, sale, or lease of real estate
- You will use the data solely to evaluate potential real estate transactions
- You understand the data may contain errors or omissions
- You agree to hold harmless ${brokerage}, its agents, TRREB, and data providers from any claims arising from your use of the data

## 7. AI Tools

AI-powered chat, plans, and estimators are provided as research and planning aids, not as authoritative advice. You acknowledge:

- AI-generated output may be inaccurate, incomplete, or out of date
- AI does not replace a licensed real estate professional
- Your conversations may be reviewed to improve service quality
- You will verify any AI-provided information before acting on it

## 8. User Accounts

If you create an account, you are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Notify us immediately of any unauthorized access.

## 9. Intellectual Property

The Service, its design, software, content, and branding (excluding third-party data and user submissions) are the property of ${brokerage} and its licensors, protected by copyright, trademark, and other laws.

The trademarks REALTOR®, REALTORS®, the REALTOR® logo, MLS®, and Multiple Listing Service® are owned or controlled by The Canadian Real Estate Association (CREA).

## 10. Third-Party Links

The Service may contain links to third-party websites. We do not control and are not responsible for the content, privacy practices, or accuracy of any third-party site.

## 11. Limitation of Liability

To the maximum extent permitted by law, ${brokerage}, ${brand}, and their directors, employees, agents, affiliates, and licensors shall not be liable for any indirect, incidental, special, consequential, or punitive damages — including loss of profits, data, goodwill, or business opportunities — arising from:

- Your use of or inability to use the Service
- Any reliance on property information, estimates, or AI-generated content
- Any real estate decision made based on information from the Service
- Any third-party content accessed through the Service

Our total aggregate liability for any claim arising from these Terms or the Service is limited to CAD \$100.

## 12. Indemnification

You agree to defend, indemnify, and hold harmless ${brokerage}, ${brand}, and their agents from any claims, damages, or costs (including reasonable legal fees) arising from your use of the Service, your breach of these Terms, or your violation of any third-party right.

## 13. Termination

We may suspend or terminate your access to the Service at any time, without notice, for any reason, including breach of these Terms.

## 14. Governing Law

These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada applicable therein. Any dispute shall be resolved in the courts of Ontario.

## 15. Changes to These Terms

We may update these Terms from time to time. Material changes will be communicated by updating the effective date and, where appropriate, via email or site notice. Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.

## 16. Contact

For questions about these Terms:

${contactLines}`
}
