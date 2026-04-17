export default function PrivacyPolicy() {
  return (
    <div style={{ background: '#020812', minHeight: '100vh' }}>
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '120px 24px', color: '#fff' }}>
      <h1 style={{ fontSize: 36, fontWeight: 900, marginBottom: 8, color: '#fff' }}>Privacy Policy</h1>
      <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 48 }}>Last updated: April 2026</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#fff' }}>What We Collect</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, marginBottom: 32 }}>
        We collect information provided directly by users of the 01leads AI platform, including name, email address, phone number, and real estate intent (buying or selling). We also collect usage data such as pages visited and interactions with the AI assistant.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#fff' }}>How We Use It</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, marginBottom: 32 }}>
        Collected information is used to generate personalized real estate plans and to connect users with their assigned real estate agent. We do not sell personal data to third parties.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#fff' }}>Data Storage</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, marginBottom: 32 }}>
        Data is stored securely using Supabase (PostgreSQL) infrastructure hosted on AWS. Data is retained for as long as the subscribing agent maintains an active account.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#fff' }}>Cookies</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, marginBottom: 32 }}>
        We use essential cookies for authentication and session management only. We do not use advertising or tracking cookies.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#fff' }}>Contact</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75 }}>
        For privacy inquiries: <a href="mailto:contact@01leads.com" style={{ color: '#3b82f6' }}>contact@01leads.com</a><br />
        Kote Marjanishvili St. 30, Tbilisi, Georgia
      </p>
    </div>
    </div>
  )
}