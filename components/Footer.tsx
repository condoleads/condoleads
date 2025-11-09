'use client'

interface FooterProps {
  agentData?: {
    full_name: string
    email: string
    phone: string
    brokerage_name?: string
    brokerage_address?: string
    title?: string
  } | null
}

export default function Footer({ agentData }: FooterProps) {
  const currentYear = new Date().getFullYear()

  // If we have agent data, show agent footer only
  if (agentData) {
    return (
      <footer className="bg-slate-900 text-white mt-20">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            {/* Agent Info */}
            <div>
              <h3 className="text-2xl font-bold mb-2">{agentData.full_name}</h3>
              {agentData.title && <p className="text-emerald-400 text-lg mb-3">{agentData.title}</p>}
              {agentData.brokerage_name && (
                <div className="text-slate-300">
                  <p className="font-semibold mb-1">{agentData.brokerage_name}</p>
                  {agentData.brokerage_address && (
                    <p className="text-sm text-slate-400">{agentData.brokerage_address}</p>
                  )}
                </div>
              )}
            </div>

            {/* Contact Info */}
            <div>
              <h4 className="font-semibold mb-4 text-lg">Contact</h4>
              <ul className="space-y-3 text-sm">
                <li>
                  <a 
                    href={`mailto:${agentData.email}`} 
                    className="text-slate-300 hover:text-emerald-400 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {agentData.email}
                  </a>
                </li>
                <li>
                  <a 
                    href={`tel:${agentData.phone.replace(/\D/g, '')}`}
                    className="text-slate-300 hover:text-emerald-400 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {agentData.phone}
                  </a>
                </li>
              </ul>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold mb-4 text-lg">Quick Links</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/" className="text-slate-400 hover:text-white transition-colors">Home</a></li>
                <li><a href="/buildings" className="text-slate-400 hover:text-white transition-colors">Browse Buildings</a></li>
                <li><a href="/estimator" className="text-slate-400 hover:text-white transition-colors">Get Estimate</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 text-center text-sm text-slate-400">
            <p>&copy; {currentYear} {agentData.full_name}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    )
  }

  // No footer for main site (CondoLeads is just a service provider)
  return null
}