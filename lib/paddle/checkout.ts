// lib/paddle/checkout.ts
// Opens the Paddle checkout overlay for a given plan bundle
import { getPaddle } from './client'
import { PLAN_BUNDLES, type PlanKey } from './prices'

export interface OpenCheckoutOptions {
  plan: PlanKey
  customerEmail?: string
  successUrl?: string
}

export async function openCheckout(options: OpenCheckoutOptions): Promise<void> {
  const { plan, customerEmail, successUrl } = options

  const paddle = await getPaddle()
  if (!paddle) {
    alert('Payment system is not available right now. Please contact contact@01leads.com.')
    return
  }

  const priceIds = PLAN_BUNDLES[plan].filter(Boolean)
  if (priceIds.length === 0) {
    console.error('[Paddle] No price IDs for plan:', plan)
    alert('This plan is not configured yet. Please contact contact@01leads.com.')
    return
  }

  // Build absolute success URL
  const defaultSuccessUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/zerooneleads/thank-you`
      : undefined

  try {
    paddle.Checkout.open({
      items: priceIds.map(priceId => ({ priceId, quantity: 1 })),
      customer: customerEmail ? { email: customerEmail } : undefined,
      settings: {
        displayMode: 'overlay',
        theme: 'light',
        variant: 'one-page',
        successUrl: successUrl || defaultSuccessUrl,
      },
    })
  } catch (err) {
    console.error('[Paddle] Checkout.open failed:', err)
    alert('Unable to open checkout. Please try again or contact contact@01leads.com.')
  }
}