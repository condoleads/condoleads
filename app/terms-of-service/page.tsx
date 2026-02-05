import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getAgentFromHost, isCustomDomain, extractSubdomain } from '@/lib/utils/agent-detection'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getAgentData() {
  const headersList = headers()
  const host = headersList.get('host') || ''
  
  // Check custom domain first
  if (isCustomDomain(host)) {
    const agent = await getAgentFromHost(host)
    if (agent) return agent
  }
  
  // Check subdomain
  const subdomain = extractSubdomain(host)
  if (subdomain) {
    const supabase = createClient()
    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('subdomain', subdomain)
      .eq('is_active', true)
      .single()
    return agent
  }
  
  return null
}

export default async function TermsOfServicePage() {
  const agent = await getAgentData()
  
  // Branding overrides → agent profile fallbacks
  const branding = agent?.branding || {}
  const operatorName = branding.legal_entity_name || agent?.full_name || 'the website operator'
  const brokerageName = agent?.brokerage_name || 'the affiliated brokerage'
  const contactEmail = branding.legal_contact_email || agent?.email || ''
  const contactPhone = branding.legal_contact_phone || agent?.cell_phone || ''
  const contactAddress = branding.legal_contact_address || agent?.brokerage_address || ''
  const effectiveDate = branding.privacy_policy_date || 'January 1, 2025'
  
  // Check for custom terms of service
  const customTerms = branding.custom_terms_of_service || null
  
  // Render custom terms if exists
  if (customTerms) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-8">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
          
          <div className="bg-white rounded-xl shadow-sm p-8 md:p-12">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Terms of Service</h1>
            <p className="text-gray-500 mb-8">Effective date: {effectiveDate}</p>
            
            <div className="prose prose-gray max-w-none">
              {customTerms.split('\n\n').map((paragraph: string, idx: number) => {
                const trimmed = paragraph.trim()
                if (!trimmed) return null
                if (trimmed.startsWith('## ')) {
                  return <h2 key={idx} className="text-2xl font-bold text-gray-900 mt-10 mb-4">{trimmed.replace('## ', '')}</h2>
                }
                if (trimmed.startsWith('### ')) {
                  return <h3 key={idx} className="text-lg font-semibold text-gray-800 mt-6 mb-2">{trimmed.replace('### ', '')}</h3>
                }
                if (trimmed.startsWith('- ')) {
                  const items = trimmed.split('\n').filter((line: string) => line.trim().startsWith('- '))
                  return (
                    <ul key={idx} className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
                      {items.map((item: string, i: number) => <li key={i}>{item.replace(/^- /, '')}</li>)}
                    </ul>
                  )
                }
                return <p key={idx} className="text-gray-700 leading-relaxed">{trimmed}</p>
              })}
            </div>

            {/* Contact Section */}
            <div className="mt-12 pt-8 border-t border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Contact Us</h2>
              <ul className="list-none text-gray-700 space-y-2">
                {contactEmail && (
                  <li><strong>By email:</strong>{' '}<a href={`mailto:${contactEmail}`} className="text-blue-600 hover:text-blue-700">{contactEmail}</a></li>
                )}
                {contactPhone && (
                  <li><strong>By phone:</strong>{' '}<a href={`tel:${contactPhone.replace(/\D/g, '')}`} className="text-blue-600 hover:text-blue-700">{contactPhone}</a></li>
                )}
                {contactAddress && (
                  <li><strong>By mail:</strong> {contactAddress}</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Back Link */}
        <Link href="/" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-8">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>
        
        <div className="bg-white rounded-xl shadow-sm p-8 md:p-12">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Terms of Service</h1>
          <p className="text-gray-500 mb-8">Effective date: {effectiveDate}</p>
          
          <div className="prose prose-gray max-w-none">
            {/* Introduction */}
            <p className="text-gray-700 leading-relaxed">
              Please read these Terms of Service (&quot;Terms&quot;, &quot;Terms of Service&quot;) carefully before using 
              this website (the &quot;Service&quot;) operated by {operatorName} {agent?.brokerage_name && `(operating under ${brokerageName})`}.
            </p>
            
            <p className="text-gray-700 leading-relaxed">
              Your access to and use of the Service is conditioned on your acceptance of and compliance with 
              these Terms. These Terms apply to all visitors, users, and others who access or use the Service.
            </p>
            
            <p className="text-gray-700 leading-relaxed font-semibold">
              By accessing or using the Service you agree to be bound by these Terms. If you disagree with 
              any part of the terms, then you may not access the Service.
            </p>

            {/* Use of Service */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Use of Service</h2>
            <p className="text-gray-700">
              This website provides real estate information, property listings, market data, and related 
              services. By using this Service, you agree to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Provide accurate and complete information when registering or submitting inquiries</li>
              <li>Use the Service only for lawful purposes and in accordance with these Terms</li>
              <li>Not use the Service for any commercial purpose without our express written consent</li>
              <li>Not attempt to gain unauthorized access to any portion of the Service</li>
              <li>Not interfere with or disrupt the Service or servers or networks connected to the Service</li>
            </ul>

            {/* Real Estate Information Disclaimer */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Real Estate Information Disclaimer</h2>
            <p className="text-gray-700">
              The real estate listings and information displayed on this website are provided for informational 
              purposes only. While we strive to ensure accuracy, we make no representations or warranties of 
              any kind, express or implied, about:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>The accuracy, completeness, or reliability of any listing information</li>
              <li>The availability of any property shown on the Service</li>
              <li>The accuracy of property prices, measurements, or descriptions</li>
              <li>Market valuations, estimates, or projections</li>
            </ul>
            <p className="text-gray-700 mt-4">
              All property information should be independently verified. Past performance of property values 
              does not guarantee future results.
            </p>

            {/* MLS Data Terms */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">MLS Data Terms of Use</h2>
            <p className="text-gray-700">
              This website displays listing information from the Toronto Regional Real Estate Board (TRREB) 
              MLS system. By accessing this information, you agree to the following:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>The listing data is for your personal, non-commercial use only</li>
              <li>You will not copy, redistribute, retransmit, or publish any listing information</li>
              <li>You will not use the information for mass mailing, solicitation, or commercial purposes</li>
              <li>The data may not be used to compile mailing lists or databases of any kind</li>
              <li>Any unauthorized use may result in termination of access and legal action</li>
            </ul>

            {/* VOW Agreement */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Virtual Office Website (VOW) Terms</h2>
            <p className="text-gray-700">
              To access certain features including historical sales data and comprehensive market information, 
              you must register and agree to the VOW Terms of Use. By registering as a VOW user, you 
              acknowledge and agree that:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>You have a bona fide interest in the purchase, sale, or lease of real estate</li>
              <li>The property information is provided exclusively for your personal use</li>
              <li>You will not use this information for any purpose other than to evaluate potential real estate transactions</li>
              <li>You understand that the information is derived from various sources and may contain errors</li>
              <li>You agree to hold harmless the website operator, brokerage, and data providers from any claims arising from your use of the data</li>
            </ul>

            {/* AI Tools Disclaimer */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">AI-Powered Features</h2>
            <p className="text-gray-700">
              This Service may include AI-powered chat assistants, property estimators, and automated tools. 
              By using these features, you understand and agree that:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>AI-generated responses are for informational purposes only and do not constitute professional real estate, legal, or financial advice</li>
              <li>Property estimates and valuations are algorithmic approximations and should not be relied upon for making purchasing or selling decisions</li>
              <li>You should always consult with a licensed real estate professional before making any real estate decisions</li>
              <li>AI features may occasionally produce inaccurate or incomplete information</li>
              <li>Conversations with AI assistants may be recorded and reviewed to improve service quality</li>
            </ul>

            {/* User Accounts */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">User Accounts</h2>
            <p className="text-gray-700">
              When you create an account with us, you must provide accurate, complete, and current information. 
              Failure to do so constitutes a breach of the Terms, which may result in immediate termination 
              of your account on our Service.
            </p>
            <p className="text-gray-700 mt-2">
              You are responsible for safeguarding the password that you use to access the Service and for 
              any activities or actions under your password.
            </p>
            <p className="text-gray-700 mt-2">
              You agree not to disclose your password to any third party. You must notify us immediately upon 
              becoming aware of any breach of security or unauthorized use of your account.
            </p>

            {/* Intellectual Property */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Intellectual Property</h2>
            <p className="text-gray-700">
              The Service and its original content (excluding content provided by users and third-party data 
              providers), features, and functionality are and will remain the exclusive property of the 
              website operator and its licensors.
            </p>
            <p className="text-gray-700 mt-2">
              The Service is protected by copyright, trademark, and other laws. Our trademarks and trade dress 
              may not be used in connection with any product or service without prior written consent.
            </p>
            <p className="text-gray-700 mt-2">
              MLS, Multiple Listing Service, and the associated logos are owned by The Canadian Real Estate 
              Association (CREA). REALTOR, REALTORS, and the REALTOR logo are controlled by CREA.
            </p>

            {/* Links to Other Websites */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Links to Other Websites</h2>
            <p className="text-gray-700">
              Our Service may contain links to third-party websites or services that are not owned or controlled 
              by us. We have no control over, and assume no responsibility for, the content, privacy policies, 
              or practices of any third-party websites or services.
            </p>
            <p className="text-gray-700 mt-2">
              You further acknowledge and agree that we shall not be responsible or liable, directly or 
              indirectly, for any damage or loss caused or alleged to be caused by or in connection with 
              the use of or reliance on any such content, goods, or services available on or through any 
              such websites or services.
            </p>

            {/* Limitation of Liability */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Limitation of Liability</h2>
            <p className="text-gray-700">
              In no event shall {operatorName}, {brokerageName}, nor their directors, employees, partners, 
              agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, 
              or punitive damages, including without limitation, loss of profits, data, use, goodwill, or 
              other intangible losses, resulting from:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Your access to or use of or inability to access or use the Service</li>
              <li>Any conduct or content of any third party on the Service</li>
              <li>Any content obtained from the Service</li>
              <li>Unauthorized access, use, or alteration of your transmissions or content</li>
              <li>Any reliance on property information, estimates, or valuations provided through the Service</li>
              <li>Any real estate transaction decisions made based on information from the Service</li>
            </ul>

            {/* Indemnification */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Indemnification</h2>
            <p className="text-gray-700">
              You agree to defend, indemnify, and hold harmless {operatorName}, {brokerageName}, and their 
              licensees and licensors, and their employees, contractors, agents, officers, and directors, 
              from and against any and all claims, damages, obligations, losses, liabilities, costs or debt, 
              and expenses (including but not limited to attorney&apos;s fees), resulting from or arising out of:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Your use and access of the Service</li>
              <li>Your violation of any term of these Terms</li>
              <li>Your violation of any third-party right, including any intellectual property or privacy right</li>
              <li>Any claim that your use of the Service caused damage to a third party</li>
            </ul>

            {/* Termination */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Termination</h2>
            <p className="text-gray-700">
              We may terminate or suspend your account immediately, without prior notice or liability, for 
              any reason whatsoever, including without limitation if you breach the Terms.
            </p>
            <p className="text-gray-700 mt-2">
              Upon termination, your right to use the Service will immediately cease. If you wish to terminate 
              your account, you may simply discontinue using the Service or contact us to request account deletion.
            </p>

            {/* Governing Law */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Governing Law</h2>
            <p className="text-gray-700">
              These Terms shall be governed and construed in accordance with the laws of the Province of 
              Ontario, Canada, without regard to its conflict of law provisions.
            </p>
            <p className="text-gray-700 mt-2">
              Our failure to enforce any right or provision of these Terms will not be considered a waiver 
              of those rights. If any provision of these Terms is held to be invalid or unenforceable by a 
              court, the remaining provisions of these Terms will remain in effect.
            </p>

            {/* Changes to Terms */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Changes to Terms</h2>
            <p className="text-gray-700">
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. 
              If a revision is material, we will try to provide at least 30 days&apos; notice prior to any new 
              terms taking effect.
            </p>
            <p className="text-gray-700 mt-2">
              What constitutes a material change will be determined at our sole discretion. By continuing to 
              access or use our Service after those revisions become effective, you agree to be bound by the 
              revised terms.
            </p>

            {/* Contact */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Contact Us</h2>
            <p className="text-gray-700">
              If you have any questions about these Terms, please contact us:
            </p>
            <ul className="list-none text-gray-700 space-y-2 mt-4">
              {contactEmail && (
                <li>
                  <strong>By email:</strong>{' '}
                  <a href={`mailto:${contactEmail}`} className="text-blue-600 hover:text-blue-700">
                    {contactEmail}
                  </a>
                </li>
              )}
              {contactPhone && (
                <li>
                  <strong>By phone:</strong>{' '}
                  <a href={`tel:${contactPhone.replace(/\D/g, '')}`} className="text-blue-600 hover:text-blue-700">
                    {contactPhone}
                  </a>
                </li>
              )}
              {contactAddress && (
                <li>
                  <strong>By mail:</strong> {contactAddress}
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
