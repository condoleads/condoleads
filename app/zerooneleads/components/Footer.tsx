export default function Footer() {
  return (
    <footer style={{ padding: '64px 24px 40px', background: '#020812', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 48, marginBottom: 56 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: '#fff' }}>01</div>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>leads</span>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.28)', maxWidth: 220, lineHeight: 1.65, margin: 0 }}>Powered by 01leads AI. The real estate platform that never sleeps.</p>
          </div>
          <div style={{ display: 'flex', gap: 64, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>Product</div>
              {['#features:Features','#how-it-works:How It Works','#pricing:Pricing','#faq:FAQ'].map(l => {
                const [href,label] = l.split(':')
                return <div key={label} style={{ marginBottom: 10 }}><a href={href} style={{ fontSize: 14, color: 'rgba(255,255,255,0.42)', textDecoration: 'none' }}>{label}</a></div>
              })}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>Company</div>
              {[
                { label: 'See Live Demo', href: 'https://walliam.ca' },
                { label: 'Contact Us', href: '/contact' },
                { label: 'Privacy Policy', href: '/privacy-policy' },
                { label: 'Refund Policy', href: '/refund-policy' },
                { label: 'Terms of Service', href: '/terms-of-service' },
              ].map(l => <div key={l.label} style={{ marginBottom: 10 }}><a href={l.href} style={{ fontSize: 14, color: 'rgba(255,255,255,0.42)', textDecoration: 'none' }}>{l.label}</a></div>)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.18)' }}>© 2026 01leads. All rights reserved.</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.18)', fontFamily: 'monospace' }}>contact@01leads.com</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)' }}>Georgia, Tbilisi, Mtatsminda district, Tabakhmela, V. Tabakhmela</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.12)' }}>Operated by Individual Entrepreneur LINKA · ID: 304805726</span>
        </div>
        </div>
      </div>
    </footer>
  )
}