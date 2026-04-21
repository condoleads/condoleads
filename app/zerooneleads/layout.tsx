import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '01leads — AI Real Estate Platform',
  description: 'Browse → Get an AI plan → Lead Captured. 01leads AI captures every lead, qualifies every buyer, estimates every home value — and delivers a personalized plan before your agent even picks up the phone.',
  openGraph: {
    title: '01leads — AI Real Estate Platform',
    description: 'Browse → Get an AI plan → Lead Captured. Powered by 01leads AI.',
    url: 'https://01leads.com',
    siteName: '01leads',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '01leads — AI Real Estate Platform',
    description: 'Browse → Get an AI plan → Lead Captured. Powered by 01leads AI.',
  },
}

export default function ZeroOneLeadsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}