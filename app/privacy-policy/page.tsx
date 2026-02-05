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

export default async function PrivacyPolicyPage() {
  const agent = await getAgentData()
  
  // Branding overrides → agent profile fallbacks
  const branding = agent?.branding || {}
  const siteName = branding.legal_entity_name || agent?.full_name || agent?.team_name || 'This Website'
  const operatorName = branding.legal_entity_name || agent?.full_name || 'the website operator'
  const brokerageName = agent?.brokerage_name || 'the affiliated brokerage'
  const contactEmail = branding.legal_contact_email || agent?.email || ''
  const contactPhone = branding.legal_contact_phone || agent?.cell_phone || ''
  const contactAddress = branding.legal_contact_address || agent?.brokerage_address || ''
  const effectiveDate = branding.privacy_policy_date || 'January 1, 2025'
  
  // Check for custom privacy policy
  const customPolicy = branding.custom_privacy_policy || null
  
  // Render custom policy if exists
  if (customPolicy) {
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
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
            <p className="text-gray-500 mb-8">Effective date: {effectiveDate}</p>
            
            <div className="prose prose-gray max-w-none">
              {customPolicy.split('\n\n').map((paragraph: string, idx: number) => {
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
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-gray-500 mb-8">Effective date: {effectiveDate}</p>
          
          <div className="prose prose-gray max-w-none">
            {/* Introduction */}
            <p className="text-gray-700 leading-relaxed">
              {operatorName} {agent?.brokerage_name && `(operating under ${brokerageName})`} operates this website 
              (hereinafter referred to as the &quot;Service&quot;). This page informs you of our policies regarding 
              the collection, use, and disclosure of personal data when you use our Service and the choices 
              you have associated with that data.
            </p>
            
            <p className="text-gray-700 leading-relaxed">
              We use your data to provide and improve the Service. By using the Service, you agree to the 
              collection and use of information in accordance with this policy.
            </p>

            {/* Definitions */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Definitions</h2>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">Service</h3>
            <p className="text-gray-700">
              Service refers to this website and the real estate services provided, including the browsing, 
              purchase, sale, or lease of properties.
            </p>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">Personal Data</h3>
            <p className="text-gray-700">
              Personal Data means data about a living individual who can be identified from those data 
              (or from those and other information either in our possession or likely to come into our possession).
            </p>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">Usage Data</h3>
            <p className="text-gray-700">
              Usage Data is data collected automatically either generated by the use of the Service or 
              from the Service infrastructure itself (for example, the duration of a page visit).
            </p>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">Cookies</h3>
            <p className="text-gray-700">
              Cookies are small files stored on your device (computer or mobile device).
            </p>

            {/* Information Collection */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Information Collection and Use</h2>
            <p className="text-gray-700">
              We collect several different types of information for various purposes to provide and 
              improve our Service to you.
            </p>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">Types of Data Collected</h3>
            
            <h4 className="text-base font-semibold text-gray-700 mt-4 mb-2">Personal Data</h4>
            <p className="text-gray-700">
              While using our Service, we may ask you to provide us with certain personally identifiable 
              information that can be used to contact or identify you (&quot;Personal Data&quot;). Personally 
              identifiable information may include, but is not limited to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Email address</li>
              <li>First name and last name</li>
              <li>Phone number</li>
              <li>Property preferences and requirements</li>
              <li>Budget and timeline information</li>
              <li>Cookies and Usage Data</li>
            </ul>
            <p className="text-gray-700 mt-4">
              We may use your Personal Data to contact you with newsletters, marketing or promotional 
              materials, property listings, and other information that may be of interest to you. You may 
              opt out of receiving any, or all, of these communications from us by following the unsubscribe 
              link or the instructions provided in any email we send.
            </p>
            
            <h4 className="text-base font-semibold text-gray-700 mt-4 mb-2">Usage Data</h4>
            <p className="text-gray-700">
              We may also collect information on how the Service is accessed and used (&quot;Usage Data&quot;). 
              This Usage Data may include information such as your computer&apos;s Internet Protocol address 
              (e.g., IP address), browser type, browser version, the pages of our Service that you visit, 
              the time and date of your visit, the time spent on those pages, unique device identifiers, 
              and other diagnostic data.
            </p>
            
            <h4 className="text-base font-semibold text-gray-700 mt-4 mb-2">Location Data</h4>
            <p className="text-gray-700">
              We may use and store information about your location if you give us permission to do so 
              (&quot;Location Data&quot;). We use this data to provide features of our Service, such as 
              location-based property searches, and to improve and customize our Service.
            </p>
            
            <h4 className="text-base font-semibold text-gray-700 mt-4 mb-2">Tracking & Cookies Data</h4>
            <p className="text-gray-700">
              We use cookies and similar tracking technologies to track the activity on our Service and 
              hold certain information. Cookies are files with a small amount of data which may include 
              an anonymous unique identifier.
            </p>
            <p className="text-gray-700 mt-2">
              You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent. 
              However, if you do not accept cookies, you may not be able to use some portions of our Service.
            </p>
            <p className="text-gray-700 mt-2">Examples of Cookies we use:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li><strong>Session Cookies:</strong> We use Session Cookies to operate our Service.</li>
              <li><strong>Preference Cookies:</strong> We use Preference Cookies to remember your preferences and various settings.</li>
              <li><strong>Security Cookies:</strong> We use Security Cookies for security purposes.</li>
            </ul>

            {/* MLS/VOW Data Access */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Real Estate Data and MLS Information</h2>
            <p className="text-gray-700">
              This website displays real estate listing information provided through licensed data feeds 
              from the Toronto Regional Real Estate Board (TRREB) and related Multiple Listing Service (MLS) systems.
            </p>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">Virtual Office Website (VOW) Registration</h3>
            <p className="text-gray-700">
              To access certain features of our Service, including historical sales data, sold prices, and 
              comprehensive market information, you may be required to register for a Virtual Office Website 
              (VOW) account. By registering, you acknowledge and agree that:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>The property information is provided for your personal, non-commercial use only</li>
              <li>You will not use this information for mass marketing or solicitation purposes</li>
              <li>You will not copy, redistribute, or retransmit any of the information provided</li>
              <li>The information is deemed reliable but not guaranteed</li>
            </ul>

            {/* AI Tools */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">AI-Powered Tools and Chat Features</h2>
            <p className="text-gray-700">
              Our Service may include AI-powered chat assistants and automated tools to help answer your 
              real estate questions and provide property information. When using these features:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Your conversations may be stored to improve service quality and provide personalized recommendations</li>
              <li>Information you provide may be used to understand your property preferences</li>
              <li>Chat history may be shared with the assigned real estate agent to better serve your needs</li>
              <li>AI responses are for informational purposes only and do not constitute professional real estate advice</li>
            </ul>

            {/* Use of Data */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Use of Data</h2>
            <p className="text-gray-700">We use the collected data for various purposes:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>To provide and maintain our Service</li>
              <li>To notify you about changes to our Service</li>
              <li>To allow you to participate in interactive features of our Service when you choose to do so</li>
              <li>To provide customer support and respond to inquiries</li>
              <li>To gather analysis or valuable information so that we can improve our Service</li>
              <li>To monitor the usage of our Service</li>
              <li>To detect, prevent and address technical issues</li>
              <li>To provide you with news, special offers, and general information about properties and services</li>
              <li>To connect you with real estate professionals who can assist with your property needs</li>
            </ul>

            {/* Data Retention */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Retention of Data</h2>
            <p className="text-gray-700">
              We will retain your Personal Data only for as long as is necessary for the purposes set out 
              in this Privacy Policy. We will retain and use your Personal Data to the extent necessary to 
              comply with our legal obligations, resolve disputes, and enforce our legal agreements and policies.
            </p>
            <p className="text-gray-700 mt-2">
              Usage Data is generally retained for a shorter period of time, except when this data is used 
              to strengthen the security or to improve the functionality of our Service, or we are legally 
              obligated to retain this data for longer periods.
            </p>

            {/* Transfer of Data */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Transfer of Data</h2>
            <p className="text-gray-700">
              Your information, including Personal Data, may be transferred to  and maintained on  computers 
              located outside of your state, province, country, or other governmental jurisdiction where the 
              data protection laws may differ from those of your jurisdiction.
            </p>
            <p className="text-gray-700 mt-2">
              If you are located outside Canada and choose to provide information to us, please note that we 
              transfer the data, including Personal Data, to Canada and process it there.
            </p>
            <p className="text-gray-700 mt-2">
              Your consent to this Privacy Policy followed by your submission of such information represents 
              your agreement to that transfer.
            </p>

            {/* Disclosure of Data */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Disclosure of Data</h2>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">Sharing with Real Estate Professionals</h3>
            <p className="text-gray-700">
              Information you provide through contact forms, property inquiries, and chat features may be 
              shared with licensed real estate agents and brokerages to facilitate your real estate transaction.
            </p>
            
            <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-2">Legal Requirements</h3>
            <p className="text-gray-700">
              We may disclose your Personal Data in the good faith belief that such action is necessary to:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Comply with a legal obligation</li>
              <li>Protect and defend our rights or property</li>
              <li>Prevent or investigate possible wrongdoing in connection with the Service</li>
              <li>Protect the personal safety of users of the Service or the public</li>
              <li>Protect against legal liability</li>
            </ul>

            {/* Service Providers */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Service Providers</h2>
            <p className="text-gray-700">
              We may employ third-party companies and individuals to facilitate our Service (&quot;Service Providers&quot;), 
              provide the Service on our behalf, perform Service-related services, or assist us in analyzing 
              how our Service is used.
            </p>
            <p className="text-gray-700 mt-2">
              These third parties have access to your Personal Data only to perform these tasks on our behalf 
              and are obligated not to disclose or use it for any other purpose. These services may include:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li>Cloud hosting and database services</li>
              <li>Email delivery services</li>
              <li>Analytics services</li>
              <li>AI and automated assistant services</li>
              <li>Licensed real estate data providers</li>
            </ul>

            {/* Security */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Security of Data</h2>
            <p className="text-gray-700">
              The security of your data is important to us, but remember that no method of transmission over 
              the Internet or method of electronic storage is 100% secure. While we strive to use commercially 
              acceptable means to protect your Personal Data, we cannot guarantee its absolute security.
            </p>

            {/* Your Rights */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Your Data Protection Rights</h2>
            <p className="text-gray-700">You have certain data protection rights, including:</p>
            <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
              <li><strong>The right to access:</strong> You have the right to request copies of your personal data.</li>
              <li><strong>The right to rectification:</strong> You have the right to request that we correct any information you believe is inaccurate or complete information you believe is incomplete.</li>
              <li><strong>The right to erasure:</strong> You have the right to request that we erase your personal data, under certain conditions.</li>
              <li><strong>The right to restrict processing:</strong> You have the right to request that we restrict the processing of your personal data, under certain conditions.</li>
              <li><strong>The right to object to processing:</strong> You have the right to object to our processing of your personal data, under certain conditions.</li>
              <li><strong>The right to data portability:</strong> You have the right to request that we transfer the data we have collected to another organization, or directly to you, under certain conditions.</li>
            </ul>
            <p className="text-gray-700 mt-4">
              If you make a request, we have one month to respond to you. If you would like to exercise any 
              of these rights, please contact us.
            </p>

            {/* Children's Privacy */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Children&apos;s Privacy</h2>
            <p className="text-gray-700">
              Our Service does not address anyone under the age of 18 (&quot;Children&quot;). We do not knowingly 
              collect personally identifiable information from anyone under the age of 18. If you are a parent 
              or guardian and you are aware that your Child has provided us with Personal Data, please contact us.
            </p>

            {/* Links to Other Sites */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Links to Other Sites</h2>
            <p className="text-gray-700">
              Our Service may contain links to other sites that are not operated by us. If you click a third-party 
              link, you will be directed to that third party&apos;s site. We strongly advise you to review the 
              Privacy Policy of every site you visit.
            </p>
            <p className="text-gray-700 mt-2">
              We have no control over and assume no responsibility for the content, privacy policies, or practices 
              of any third-party sites or services.
            </p>

            {/* Changes */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Changes to This Privacy Policy</h2>
            <p className="text-gray-700">
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting 
              the new Privacy Policy on this page and updating the &quot;effective date&quot; at the top of this Privacy Policy.
            </p>
            <p className="text-gray-700 mt-2">
              You are advised to review this Privacy Policy periodically for any changes. Changes to this 
              Privacy Policy are effective when they are posted on this page.
            </p>

            {/* Contact */}
            <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">Contact Us</h2>
            <p className="text-gray-700">
              If you have any questions about this Privacy Policy, please contact us:
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

            {/* MLS Disclaimer */}
            <div className="mt-12 pt-8 border-t border-gray-200">
              <p className="text-sm text-gray-500">
                MLS, Multiple Listing Service, and the associated logos are owned by The Canadian Real Estate 
                Association (CREA) and identify the quality of services provided by real estate professionals 
                who are members of CREA. The trademarks REALTOR, REALTORS, and the REALTOR logo are controlled 
                by CREA and identify real estate professionals who are members of CREA.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
