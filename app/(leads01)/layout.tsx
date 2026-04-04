import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })
export const metadata: Metadata = {
  title: '01leads — AI Real Estate Platform',
  description: 'Give every agent on your team an AI assistant that captures leads 24/7.',
  metadataBase: new URL('https://01leads.com'),
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body style={{ margin: 0, background: '#020812', color: '#fff', fontFamily: 'var(--font-inter), system-ui, sans-serif', overflowX: 'hidden' }}>
        {children}
      </body>
    </html>
  )
}