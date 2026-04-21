export default function RefundPolicy() {
  return (
    <div style={{ background: '#020812', minHeight: '100vh' }}>
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '120px 24px', color: '#fff' }}>
      <h1 style={{ fontSize: 36, fontWeight: 900, marginBottom: 8, color: '#fff' }}>Refund Policy</h1>
      <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 48 }}>Last updated: April 2026</p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#fff' }}>Setup Fee</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, marginBottom: 32 }}>
        The one-time setup fee covers initial onboarding and your first month of service. It is non-refundable once onboarding has commenced. If you cancel before onboarding begins, a full refund of the setup fee will be issued within 5 business days.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#fff' }}>Monthly Subscription</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, marginBottom: 32 }}>
        Monthly subscription billing begins in your second month. Subscriptions can be cancelled at any time. Cancellations take effect at the end of the current billing period. No partial refunds are issued for unused days within a billing period.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#fff' }}>Chargebacks and Disputes</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, marginBottom: 32 }}>
        Before initiating a chargeback with your card issuer, please contact us first at contact@01leads.com. We aim to resolve billing concerns within 5 business days.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#fff' }}>Payment Processing</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, marginBottom: 32 }}>
        All payments are processed by Paddle.com Market Ltd., acting as the Merchant of Record. Refunds issued per this policy will be returned to the original payment method via Paddle.
      </p>

      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: '#fff' }}>Contact</h2>
      <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75 }}>
        For refund requests or questions, contact us at <a href="mailto:contact@01leads.com" style={{ color: '#3b82f6' }}>contact@01leads.com</a>.
      </p>
    </div>
    </div>
  )
}