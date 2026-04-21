// lib/paddle/prices.ts
// Paddle price ID constants + plan bundles
// All IDs read from NEXT_PUBLIC_PADDLE_PRICE_* env vars

export const PADDLE_PRICES = {
  // Recurring subscriptions
  SOLO_STARTER: process.env.NEXT_PUBLIC_PADDLE_PRICE_SOLO_STARTER || '',
  SOLO_PREMIUM: process.env.NEXT_PUBLIC_PADDLE_PRICE_SOLO_PREMIUM || '',
  TEAM_STARTER: process.env.NEXT_PUBLIC_PADDLE_PRICE_TEAM_STARTER || '',
  TEAM_PREMIUM: process.env.NEXT_PUBLIC_PADDLE_PRICE_TEAM_PREMIUM || '',
  ENTERPRISE: process.env.NEXT_PUBLIC_PADDLE_PRICE_ENTERPRISE || '',

  // One-time setup fees
  SOLO_SETUP: process.env.NEXT_PUBLIC_PADDLE_PRICE_SOLO_SETUP || '',
  TEAM_SETUP: process.env.NEXT_PUBLIC_PADDLE_PRICE_TEAM_SETUP || '',
} as const

export type PaddlePriceKey = keyof typeof PADDLE_PRICES

// Plan bundles — what prices get added to cart for each checkout flow
// Setup fee + first subscription charge together at checkout
export const PLAN_BUNDLES = {
  soloStarter: [PADDLE_PRICES.SOLO_SETUP, PADDLE_PRICES.SOLO_STARTER],
  soloPremium: [PADDLE_PRICES.SOLO_SETUP, PADDLE_PRICES.SOLO_PREMIUM],
  teamStarter: [PADDLE_PRICES.TEAM_SETUP, PADDLE_PRICES.TEAM_STARTER],
  teamPremium: [PADDLE_PRICES.TEAM_SETUP, PADDLE_PRICES.TEAM_PREMIUM],
  enterprise: [PADDLE_PRICES.ENTERPRISE], // enterprise handled manually, no setup fee bundle
} as const

export type PlanKey = keyof typeof PLAN_BUNDLES

// Runtime check — logs which price IDs are missing (dev aid)
export function validatePaddlePrices(): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  for (const [key, value] of Object.entries(PADDLE_PRICES)) {
    if (!value) missing.push(key)
  }
  return { ok: missing.length === 0, missing }
}