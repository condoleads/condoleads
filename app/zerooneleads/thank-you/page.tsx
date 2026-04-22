// app/zerooneleads/thank-you/page.tsx
// Post-checkout landing — shown after a successful Paddle payment

export const metadata = {
  title: 'Thanks — 01leads',
  description: 'Payment received. We will be in touch shortly.',
  robots: { index: false, follow: false },
}

export default function ThankYouPage() {
  return (
    <section style={{ minHeight: '80vh', background: '#020812', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
      <div style={{ maxWidth: 640, width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '6px 16px', borderRadius: 100, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', fontSize: 11, fontWeight: 700, color: '#10b981', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 28 }}>Payment received</div>

        <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 20 }}>
          Welcome aboard.
        </h1>

        <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, marginBottom: 36, maxWidth: 520, margin: '0 auto 36px' }}>
          Your payment is through. You will receive a Paddle receipt in your inbox within a few minutes. Our team will reach out within 24 hours to start your onboarding.
        </p>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '28px 32px', textAlign: 'left', marginBottom: 36 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>What happens next</div>
          <ol style={{ margin: 0, padding: '0 0 0 20px', color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 1.8 }}>
            <li>Check your email for your Paddle receipt and tax invoice.</li>
            <li>Our team will email you within 24 hours to schedule your onboarding call.</li>
            <li>Your first month is covered by your setup fee. Recurring billing starts 30 days from today.</li>
          </ol>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/zerooneleads" style={{ padding: '14px 28px', borderRadius: 100, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
            Back to 01leads.com
          </a>
          <a href="https://walliam.ca" target="_blank" rel="noopener" style={{ padding: '14px 28px', borderRadius: 100, background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 700, boxShadow: '0 8px 24px rgba(139,92,246,0.3)' }}>
            See WALLiam Live
          </a>
        </div>

        <p style={{ marginTop: 40, fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
          Questions? Email <a href="mailto:contact@01leads.com" style={{ color: 'rgba(255,255,255,0.6)' }}>contact@01leads.com</a>
        </p>
      </div>
    </section>
  )
}